import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

import { decodeJwtPayload, extractAuthClaims } from "./claims.js";
import { type AuthClaims, StoredAuthSchema, type StoredAuth } from "./schema.js";

export const AUTH_DIRECTORY_PATH = path.join(os.homedir(), ".chatgpt-codex");
export const AUTH_FILE_PATH = path.join(AUTH_DIRECTORY_PATH, "auth.json");
export const CODEX_AUTH_FALLBACK_PATHS = [
  process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "auth.json") : null,
  path.join(os.homedir(), ".codex", "auth.json"),
].filter((candidate): candidate is string => Boolean(candidate));

export type PersistedTokens = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
};

export async function loadStoredAuth(): Promise<StoredAuth | null> {
  const loadedAuth = await loadStoredAuthWithSource();
  return loadedAuth?.storedAuth ?? null;
}

export async function loadStoredAuthWithSource(): Promise<{
  storedAuth: StoredAuth;
  sourcePath: string;
} | null> {
  for (const candidatePath of [AUTH_FILE_PATH, ...CODEX_AUTH_FALLBACK_PATHS]) {
    try {
      const contents = await readFile(candidatePath, "utf8");
      return {
        storedAuth: parseStoredAuthContents(contents),
        sourcePath: candidatePath,
      };
    } catch (error) {
      if (isMissingFileError(error)) {
        continue;
      }

      throw error;
    }
  }

  return null;
}

export async function saveStoredAuth(input: {
  tokens: PersistedTokens;
  claims: AuthClaims;
  lastRefresh: string | null;
}): Promise<StoredAuth> {
  const record = StoredAuthSchema.parse({
    provider: "openai-chatgpt-subscription",
    version: 1,
    tokens: {
      id_token: input.tokens.idToken,
      access_token: input.tokens.accessToken,
      refresh_token: input.tokens.refreshToken,
      account_id: input.claims.chatgpt_account_id,
    },
    claims: input.claims,
    last_refresh: input.lastRefresh,
  });

  await mkdir(AUTH_DIRECTORY_PATH, { recursive: true });
  await writeFile(AUTH_FILE_PATH, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(AUTH_FILE_PATH, 0o600);

  return record;
}

export async function clearStoredAuth(): Promise<void> {
  await rm(AUTH_FILE_PATH, { force: true });
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function parseStoredAuthContents(contents: string): StoredAuth {
  const json = JSON.parse(contents);
  const parsedStoredAuth = StoredAuthSchema.safeParse(json);

  if (parsedStoredAuth.success) {
    return parsedStoredAuth.data;
  }

  return normalizeCodexAuthFile(json);
}

const CodexAuthFileSchema = z.object({
  OPENAI_API_KEY: z.string().nullable().optional(),
  tokens: z.object({
    id_token: z.string().min(1),
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    account_id: z.string().min(1).optional(),
  }),
  last_refresh: z.string().optional(),
});

function normalizeCodexAuthFile(input: unknown): StoredAuth {
  const parsed = CodexAuthFileSchema.parse(input);
  const claims = extractAuthClaims(
    decodeJwtPayload(parsed.tokens.id_token),
    decodeJwtPayload(parsed.tokens.access_token),
  );

  return StoredAuthSchema.parse({
    provider: "openai-chatgpt-subscription",
    version: 1,
    tokens: {
      id_token: parsed.tokens.id_token,
      access_token: parsed.tokens.access_token,
      refresh_token: parsed.tokens.refresh_token,
      account_id: parsed.tokens.account_id ?? claims.chatgpt_account_id,
    },
    claims,
    last_refresh: parsed.last_refresh ?? null,
  });
}
