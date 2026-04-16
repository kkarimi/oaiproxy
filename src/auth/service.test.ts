import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { AppConfig } from "../config.js";
import { AuthService } from "./service.js";

test("clearStoredAuth cancels a pending OAuth login so a new login can start cleanly", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "oaiproxy-auth-service-"));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const service = new AuthService(buildTestConfig(tempRoot));
  const redirectUri = "http://localhost:1455/auth/callback";

  const firstLogin = await service.beginLogin({
    redirectUri,
    openBrowserWindow: false,
  });

  await service.clearStoredAuth();

  await assert.rejects(
    firstLogin.completion,
    /OAuth login was cancelled by local auth reset\./,
  );

  const secondLogin = await service.beginLogin({
    redirectUri,
    openBrowserWindow: false,
  });

  assert.notEqual(secondLogin.authorizationUrl, firstLogin.authorizationUrl);
});

function buildTestConfig(tempRoot: string): AppConfig {
  return {
    server: {
      host: "127.0.0.1",
      port: 1455,
    },
    auth: {
      startupLoginPrompt: false,
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
