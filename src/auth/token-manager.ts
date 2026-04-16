import { type StoredAuth } from "./schema.js";

export function shouldRefreshStoredAuth(
  storedAuth: StoredAuth,
  refreshWindowMs: number,
  now = new Date(),
): boolean {
  const expiresAtMs = storedAuth.claims.expires_at * 1000;
  return expiresAtMs - now.getTime() <= refreshWindowMs;
}

export function isStoredAuthExpired(
  storedAuth: StoredAuth,
  now = new Date(),
): boolean {
  return storedAuth.claims.expires_at * 1000 <= now.getTime();
}
