import assert from "node:assert/strict";
import test from "node:test";

import { extractAuthClaims } from "./claims.js";

test("extractAuthClaims reads nested auth and profile claims", () => {
  const claims = extractAuthClaims(
    {
      email: "user@example.com",
      name: "Test User",
      sub: "auth0|abc",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct_123",
        chatgpt_plan_type: "pro",
        organizations: [{ id: "org_123" }],
      },
    },
    {
      exp: 1_800_000_000,
      "https://api.openai.com/profile": {
        email: "user@example.com",
      },
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct_123",
      },
    },
  );

  assert.deepEqual(claims, {
    email: "user@example.com",
    name: "Test User",
    sub: "auth0|abc",
    plan_type: "pro",
    chatgpt_account_id: "acct_123",
    expires_at: 1_800_000_000,
    organizations: [{ id: "org_123" }],
  });
});
