import { type StoredAuth } from "./schema.js";

export type AuthStatus = {
  authenticated: boolean;
  reason: "ok" | "missing" | "expired";
  auth_path: string;
  email: string | null;
  plan_type: string | null;
  account_id: string | null;
  expires_at: string | null;
  expires_at_unix: number | null;
};

export function buildMissingAuthStatus(authPath: string): AuthStatus {
  return {
    authenticated: false,
    reason: "missing",
    auth_path: authPath,
    email: null,
    plan_type: null,
    account_id: null,
    expires_at: null,
    expires_at_unix: null,
  };
}

export function buildAuthStatus(
  storedAuth: StoredAuth,
  sourcePath: string,
  now = new Date(),
): AuthStatus {
  const expiresAt = new Date(storedAuth.claims.expires_at * 1000);
  const authenticated = isStoredAuthUsable(storedAuth, now);

  return {
    authenticated,
    reason: authenticated ? "ok" : "expired",
    auth_path: sourcePath,
    email: storedAuth.claims.email ?? null,
    plan_type: storedAuth.claims.plan_type ?? null,
    account_id: storedAuth.claims.chatgpt_account_id,
    expires_at: expiresAt.toISOString(),
    expires_at_unix: storedAuth.claims.expires_at,
  };
}

export function isStoredAuthUsable(
  storedAuth: StoredAuth,
  now = new Date(),
): boolean {
  return storedAuth.claims.expires_at * 1000 > now.getTime();
}
