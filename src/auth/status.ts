import { type StoredAuth } from "./schema.js";
import { AUTH_FILE_PATH, loadStoredAuthWithSource } from "./token-store.js";

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

export async function getAuthStatus(now = new Date()): Promise<AuthStatus> {
  const loadedAuth = await loadStoredAuthWithSource();

  if (!loadedAuth) {
    return {
      authenticated: false,
      reason: "missing",
      auth_path: AUTH_FILE_PATH,
      email: null,
      plan_type: null,
      account_id: null,
      expires_at: null,
      expires_at_unix: null,
    };
  }

  const { storedAuth, sourcePath } = loadedAuth;
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
