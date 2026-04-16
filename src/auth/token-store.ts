import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type AuthClaims, StoredAuthSchema, type StoredAuth } from "./schema.js";

export const AUTH_DIRECTORY_PATH = path.join(os.homedir(), ".chatgpt-codex");
export const AUTH_FILE_PATH = path.join(AUTH_DIRECTORY_PATH, "auth.json");

export type PersistedTokens = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
};

export async function loadStoredAuth(): Promise<StoredAuth | null> {
  try {
    const contents = await readFile(AUTH_FILE_PATH, "utf8");
    return StoredAuthSchema.parse(JSON.parse(contents));
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
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
