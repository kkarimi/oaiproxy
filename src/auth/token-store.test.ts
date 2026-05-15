import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { AppConfig } from "../config.js";
import { loadStoredAuthWithSource } from "./token-store.js";

test("loadStoredAuthWithSource skips malformed primary auth and uses fallback auth", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "oaiproxy-auth-"));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const config = buildTestConfig(tempRoot);
  await mkdir(config.auth.directoryPath, { recursive: true });
  await mkdir(path.dirname(config.auth.codexFallbackPaths[0] ?? ""), {
    recursive: true,
  });

  await writeFile(config.auth.filePath, "{not-valid-json", "utf8");
  await writeFile(
    config.auth.codexFallbackPaths[0]!,
    `${JSON.stringify(createStoredAuthRecord(), null, 2)}\n`,
    "utf8",
  );

  const loadedAuth = await loadStoredAuthWithSource(config);

  assert.ok(loadedAuth);
  assert.equal(loadedAuth.sourcePath, config.auth.codexFallbackPaths[0]);
  assert.equal(loadedAuth.storedAuth.claims.chatgpt_account_id, "acct_fallback");
});

test("loadStoredAuthWithSource returns null when auth files are invalid or missing", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "oaiproxy-auth-"));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const config = buildTestConfig(tempRoot);
  await mkdir(config.auth.directoryPath, { recursive: true });
  await mkdir(path.dirname(config.auth.codexFallbackPaths[0] ?? ""), {
    recursive: true,
  });

  await writeFile(config.auth.filePath, "{not-valid-json", "utf8");
  await writeFile(config.auth.codexFallbackPaths[0]!, '{"broken":true}', "utf8");

  const loadedAuth = await loadStoredAuthWithSource(config);

  assert.equal(loadedAuth, null);
});

function buildTestConfig(tempRoot: string): AppConfig {
  return {
    server: {
      host: "127.0.0.1",
      port: 1455,
    },
    auth: {
      startupLoginPrompt: false,
      routesEnabled: true,
      openBrowserOnLogin: true,
      redirectHost: "localhost",
      callbackPath: "/auth/callback",
      directoryPath: path.join(tempRoot, ".chatgpt-codex"),
      filePath: path.join(tempRoot, ".chatgpt-codex", "auth.json"),
      codexFallbackPaths: [path.join(tempRoot, ".codex", "auth.json")],
      oauthClientId: "client",
      oauthScopes: "openid profile email offline_access",
      authorizeUrl: "https://auth.openai.com/oauth/authorize",
      tokenUrl: "https://auth.openai.com/oauth/token",
    },
    proxy: {
      codexResponsesUrl: "https://chatgpt.com/backend-api/codex/responses",
      supportedModels: ["gpt-5.4"],
      refreshWindowMs: 5 * 60 * 1000,
      upstreamTimeoutMs: 30_000,
    },
    log: {
      level: "silent",
    },
  };
}

function createStoredAuthRecord() {
  return {
    provider: "openai-chatgpt-subscription",
    version: 1,
    tokens: {
      id_token: "id_token",
      access_token: "access_token",
      refresh_token: "refresh_token",
      account_id: "acct_fallback",
    },
    claims: {
      email: "fallback@example.com",
      chatgpt_account_id: "acct_fallback",
      plan_type: "pro",
      expires_at: 1_893_456_000,
    },
    last_refresh: null,
  };
}
