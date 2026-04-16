import assert from "node:assert/strict";
import test from "node:test";

import type { AppServices } from "./app-services.js";
import { AuthRequiredError } from "./auth/errors.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

test("buildServer serves health and models routes", async (t) => {
  const app = await buildServer(
    loadConfig({
      ...process.env,
      LOG_LEVEL: "silent",
    }),
  );

  t.after(async () => {
    await app.close();
  });

  const healthResponse = await app.inject({
    method: "GET",
    url: "/health",
  });
  assert.equal(healthResponse.statusCode, 200);
  assert.deepEqual(healthResponse.json(), { ok: true });

  const modelsResponse = await app.inject({
    method: "GET",
    url: "/v1/models",
  });
  assert.equal(modelsResponse.statusCode, 200);
  assert.deepEqual(modelsResponse.json(), {
    object: "list",
    data: [
      {
        id: "gpt-5.4",
        object: "model",
        created: 0,
        owned_by: "openai",
      },
    ],
  });
});

test("buildServer uses injected auth service for auth status and logout", async (t) => {
  let logoutCalled = false;

  const app = await buildServer(loadConfig({ ...process.env, LOG_LEVEL: "silent" }), {
    auth: {
      async getStatus() {
        return {
          authenticated: false,
          reason: "missing",
          auth_path: "/tmp/auth.json",
          email: null,
          plan_type: null,
          account_id: null,
          expires_at: null,
          expires_at_unix: null,
        };
      },
      async clearStoredAuth() {
        logoutCalled = true;
      },
      async beginLogin() {
        throw new Error("not used");
      },
      async completeLogin() {
        throw new Error("not used");
      },
      async getStoredAuthWithRefresh() {
        throw new Error("not used");
      },
      async requireStoredAuthWithRefresh() {
        throw new Error("not used");
      },
    } satisfies AppServices["auth"],
  });

  t.after(async () => {
    await app.close();
  });

  const statusResponse = await app.inject({
    method: "GET",
    url: "/auth/status",
  });
  assert.equal(statusResponse.statusCode, 200);
  assert.deepEqual(statusResponse.json(), {
    authenticated: false,
    reason: "missing",
    auth_path: "/tmp/auth.json",
    email: null,
    plan_type: null,
    account_id: null,
    expires_at: null,
    expires_at_unix: null,
  });

  const logoutResponse = await app.inject({
    method: "POST",
    url: "/auth/logout",
  });
  assert.equal(logoutResponse.statusCode, 200);
  assert.deepEqual(logoutResponse.json(), { ok: true });
  assert.equal(logoutCalled, true);
});

test("chat completions returns a validation error for invalid requests", async (t) => {
  const app = await buildServer(
    loadConfig({ ...process.env, LOG_LEVEL: "silent" }),
    createAuthServiceStub(),
  );

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/chat/completions",
    payload: {
      stream: true,
      messages: [],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().error.message, /expected string|required/i);
});

test("chat completions returns auth_error when auth is missing", async (t) => {
  const app = await buildServer(
    loadConfig({ ...process.env, LOG_LEVEL: "silent" }),
    createAuthServiceStub({
      async requireStoredAuthWithRefresh() {
        throw new AuthRequiredError("Login required");
      },
    }),
  );

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/chat/completions",
    payload: {
      model: "gpt-5.4",
      stream: true,
      messages: [{ role: "user", content: "hello" }],
    },
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), {
    error: {
      message: "Login required",
      type: "auth_error",
    },
  });
});

function createAuthServiceStub(
  overrides: Partial<AppServices["auth"]> = {},
): AppServices {
  return {
    auth: {
      async getStatus() {
        return {
          authenticated: true,
          reason: "ok",
          auth_path: "/tmp/auth.json",
          email: "user@example.com",
          plan_type: "pro",
          account_id: "acct_123",
          expires_at: "2030-01-01T00:00:00.000Z",
          expires_at_unix: 1_893_456_000,
        };
      },
      async clearStoredAuth() {},
      async beginLogin() {
        return {
          authorizationUrl: "https://example.com/login",
          completion: new Promise(() => {}),
        };
      },
      async completeLogin() {
        throw new Error("not used");
      },
      async getStoredAuthWithRefresh() {
        return {
          storedAuth: null,
          refreshed: false,
          refreshError: null,
        };
      },
      async requireStoredAuthWithRefresh() {
        throw new AuthRequiredError();
      },
      ...overrides,
    },
  };
}
