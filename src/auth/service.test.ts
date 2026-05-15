import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { AppConfig } from "../config.js";
import { AuthService } from "./service.js";
import { loadStoredAuthWithSource } from "./token-store.js";

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

test("getStatus refreshes expired fallback auth and reports the refreshed primary auth", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "oaiproxy-auth-service-"));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const tokenResponse = createTokenResponse({
    accountId: "acct_refreshed",
    expiresAt: 2_200_000_000,
    refreshToken: "refresh_new",
  });
  const tokenServer = await startTokenServer(tokenResponse);
  t.after(async () => {
    await tokenServer.close();
  });

  const config = buildTestConfig(tempRoot, {
    tokenUrl: tokenServer.url,
  });
  await mkdir(path.dirname(config.auth.codexFallbackPaths[0] ?? ""), {
    recursive: true,
  });
  await writeFile(
    config.auth.codexFallbackPaths[0]!,
    `${JSON.stringify(
      createStoredAuthRecord({
        accountId: "acct_stale",
        expiresAt: 1_700_000_000,
        refreshToken: "refresh_old",
      }),
      null,
      2,
    )}\n`,
    "utf8",
  );

  const service = new AuthService(config);
  const status = await service.getStatus(new Date("2026-04-16T12:00:00.000Z"));

  assert.deepEqual(status, {
    authenticated: true,
    reason: "ok",
    auth_path: config.auth.filePath,
    email: "refreshed@example.com",
    plan_type: "pro",
    account_id: "acct_refreshed",
    expires_at: new Date(2_200_000_000 * 1000).toISOString(),
    expires_at_unix: 2_200_000_000,
  });
  assert.match(tokenServer.lastRequestBody, /grant_type=refresh_token/);
  assert.match(tokenServer.lastRequestBody, /refresh_token=refresh_old/);

  const persistedAuth = await loadStoredAuthWithSource(config);
  assert.ok(persistedAuth);
  assert.equal(persistedAuth.sourcePath, config.auth.filePath);
  assert.equal(persistedAuth.storedAuth.tokens.refresh_token, "refresh_new");
  assert.equal(
    persistedAuth.storedAuth.claims.chatgpt_account_id,
    "acct_refreshed",
  );
});

function buildTestConfig(
  tempRoot: string,
  overrides: {
    tokenUrl?: string;
  } = {},
): AppConfig {
  return {
    server: {
      host: "127.0.0.1",
      port: 1455,
    },
    auth: {
      startupLoginPrompt: false,
      routesEnabled: true,
      redirectHost: "localhost",
      callbackPath: "/auth/callback",
      directoryPath: path.join(tempRoot, ".chatgpt-codex"),
      filePath: path.join(tempRoot, ".chatgpt-codex", "auth.json"),
      codexFallbackPaths: [path.join(tempRoot, ".codex", "auth.json")],
      oauthClientId: "client",
      oauthScopes: "openid profile email offline_access",
      authorizeUrl: "https://auth.openai.com/oauth/authorize",
      tokenUrl: overrides.tokenUrl ?? "https://auth.openai.com/oauth/token",
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

function createStoredAuthRecord(input: {
  accountId: string;
  expiresAt: number;
  refreshToken: string;
}) {
  return {
    provider: "openai-chatgpt-subscription",
    version: 1,
    tokens: {
      id_token: createJwt({
        email: "stale@example.com",
        "https://api.openai.com/auth": {
          chatgpt_account_id: input.accountId,
          chatgpt_plan_type: "pro",
        },
      }),
      access_token: createJwt({
        exp: input.expiresAt,
        "https://api.openai.com/profile": {
          email: "stale@example.com",
        },
        "https://api.openai.com/auth": {
          chatgpt_account_id: input.accountId,
          chatgpt_plan_type: "pro",
        },
      }),
      refresh_token: input.refreshToken,
      account_id: input.accountId,
    },
    claims: {
      email: "stale@example.com",
      chatgpt_account_id: input.accountId,
      plan_type: "pro",
      expires_at: input.expiresAt,
    },
    last_refresh: null,
  };
}

function createTokenResponse(input: {
  accountId: string;
  expiresAt: number;
  refreshToken: string;
}) {
  return {
    id_token: createJwt({
      email: "refreshed@example.com",
      name: "Refreshed User",
      sub: "auth0|refreshed",
      "https://api.openai.com/auth": {
        chatgpt_account_id: input.accountId,
        chatgpt_plan_type: "pro",
      },
    }),
    access_token: createJwt({
      exp: input.expiresAt,
      "https://api.openai.com/profile": {
        email: "refreshed@example.com",
      },
      "https://api.openai.com/auth": {
        chatgpt_account_id: input.accountId,
        chatgpt_plan_type: "pro",
      },
    }),
    refresh_token: input.refreshToken,
  };
}

function createJwt(payload: Record<string, unknown>): string {
  const header = {
    alg: "none",
    typ: "JWT",
  };

  return [
    Buffer.from(JSON.stringify(header)).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

async function startTokenServer(tokenResponse: {
  id_token: string;
  access_token: string;
  refresh_token: string;
}) {
  let lastRequestBody = "";

  const server = createServer((request, response) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      lastRequestBody = body;
      response.writeHead(200, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify(tokenResponse));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to determine token server address");
  }

  return {
    url: `http://127.0.0.1:${address.port}/token`,
    get lastRequestBody() {
      return lastRequestBody;
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}
