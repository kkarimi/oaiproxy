import { AuthRequiredError } from "./errors.js";
import { getConfig } from "../config.js";
import { type StoredAuth } from "./schema.js";
import { refreshOAuthTokens } from "./oauth.js";
import { loadStoredAuth } from "./token-store.js";

export async function getStoredAuthWithRefresh(
  now = new Date(),
): Promise<{
  storedAuth: StoredAuth | null;
  refreshed: boolean;
  refreshError: Error | null;
}> {
  const storedAuth = await loadStoredAuth();

  if (!storedAuth) {
    return {
      storedAuth: null,
      refreshed: false,
      refreshError: null,
    };
  }

  if (!shouldRefreshStoredAuth(storedAuth, now)) {
    return {
      storedAuth,
      refreshed: false,
      refreshError: null,
    };
  }

  try {
    const refreshedAuth = await refreshOAuthTokens(storedAuth.tokens.refresh_token);
    return {
      storedAuth: refreshedAuth,
      refreshed: true,
      refreshError: null,
    };
  } catch (error) {
    if (isStoredAuthExpired(storedAuth, now)) {
      throw new AuthRequiredError(
        "Stored ChatGPT auth is expired and refresh failed. Start login again with POST /auth/login.",
      );
    }

    return {
      storedAuth,
      refreshed: false,
      refreshError:
        error instanceof Error
          ? error
          : new Error("Unexpected refresh failure"),
    };
  }
}

export function shouldRefreshStoredAuth(
  storedAuth: StoredAuth,
  now = new Date(),
): boolean {
  const expiresAtMs = storedAuth.claims.expires_at * 1000;
  return expiresAtMs - now.getTime() <= getConfig().proxy.refreshWindowMs;
}

export function isStoredAuthExpired(
  storedAuth: StoredAuth,
  now = new Date(),
): boolean {
  return storedAuth.claims.expires_at * 1000 <= now.getTime();
}

export async function requireStoredAuthWithRefresh(
  now = new Date(),
): Promise<StoredAuth> {
  const result = await getStoredAuthWithRefresh(now);

  if (!result.storedAuth) {
    throw new AuthRequiredError();
  }

  return result.storedAuth;
}
