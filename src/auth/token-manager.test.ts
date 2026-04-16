import assert from "node:assert/strict";
import test from "node:test";

import { isStoredAuthExpired, shouldRefreshStoredAuth } from "./token-manager.js";
import type { StoredAuth } from "./schema.js";

const BASE_AUTH: StoredAuth = {
  provider: "openai-chatgpt-subscription",
  version: 1,
  tokens: {
    id_token: "id",
    access_token: "access",
    refresh_token: "refresh",
    account_id: "acct_123",
  },
  claims: {
    email: "user@example.com",
    name: "Test User",
    sub: "auth0|abc",
    plan_type: "pro",
    chatgpt_account_id: "acct_123",
    expires_at: 2_000_000_000,
    organizations: [],
  },
  last_refresh: null,
};

test("shouldRefreshStoredAuth flips true inside the 5 minute window", () => {
  assert.equal(
    shouldRefreshStoredAuth(
      BASE_AUTH,
      new Date(BASE_AUTH.claims.expires_at * 1000 - 4 * 60 * 1000),
    ),
    true,
  );

  assert.equal(
    shouldRefreshStoredAuth(
      BASE_AUTH,
      new Date(BASE_AUTH.claims.expires_at * 1000 - 10 * 60 * 1000),
    ),
    false,
  );
});

test("isStoredAuthExpired flips true at and after expiry", () => {
  assert.equal(
    isStoredAuthExpired(BASE_AUTH, new Date(BASE_AUTH.claims.expires_at * 1000)),
    true,
  );

  assert.equal(
    isStoredAuthExpired(
      BASE_AUTH,
      new Date(BASE_AUTH.claims.expires_at * 1000 - 1),
    ),
    false,
  );
});
