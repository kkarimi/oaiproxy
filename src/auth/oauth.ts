import { z } from "zod";

import { getConfig } from "../config.js";
import { fetchWithTimeout } from "../http.js";
import { decodeJwtPayload, extractAuthClaims } from "./claims.js";
import { openBrowser } from "./browser.js";
import { createPkceChallenge } from "./pkce.js";
import { saveStoredAuth, type PersistedTokens } from "./token-store.js";
import { type StoredAuth } from "./schema.js";

const OAuthTokenResponseSchema = z.object({
  id_token: z.string().min(1),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});
type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;

type PendingLogin = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  authorizationUrl: string;
  completion: Promise<StoredAuth>;
  resolve: (auth: StoredAuth) => void;
  reject: (error: Error) => void;
};

let pendingLogin: PendingLogin | null = null;

export async function beginOAuthLogin(options: {
  redirectUri: string;
  openBrowserWindow?: boolean;
}): Promise<{
  authorizationUrl: string;
  completion: Promise<StoredAuth>;
}> {
  if (pendingLogin) {
    return {
      authorizationUrl: pendingLogin.authorizationUrl,
      completion: pendingLogin.completion,
    };
  }

  const pkce = createPkceChallenge();
  const authorizationUrl = buildAuthorizationUrl({
    redirectUri: options.redirectUri,
    codeChallenge: pkce.codeChallenge,
    state: pkce.state,
  });

  let resolveLogin!: (auth: StoredAuth) => void;
  let rejectLogin!: (error: Error) => void;

  const completion = new Promise<StoredAuth>((resolve, reject) => {
    resolveLogin = resolve;
    rejectLogin = reject;
  });

  pendingLogin = {
    state: pkce.state,
    codeVerifier: pkce.codeVerifier,
    redirectUri: options.redirectUri,
    authorizationUrl,
    completion,
    resolve: resolveLogin,
    reject: rejectLogin,
  };

  if (options.openBrowserWindow !== false) {
    try {
      await openBrowser(authorizationUrl);
    } catch (error) {
      clearPendingLogin(error instanceof Error ? error : undefined);
      throw error;
    }
  }

  return {
    authorizationUrl,
    completion,
  };
}

export async function completeOAuthLogin(input: {
  code: string;
  state: string;
}): Promise<StoredAuth> {
  const currentLogin = pendingLogin;

  if (!currentLogin) {
    throw new Error("No OAuth login is currently pending");
  }

  if (currentLogin.state !== input.state) {
    throw new Error("OAuth state mismatch");
  }

  try {
    const tokenResponse = await exchangeAuthorizationCode({
      code: input.code,
      codeVerifier: currentLogin.codeVerifier,
      redirectUri: currentLogin.redirectUri,
    });

    const storedAuth = await persistOAuthTokens({
      idToken: tokenResponse.id_token,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
    });
    clearPendingLogin();
    currentLogin.resolve(storedAuth);

    return storedAuth;
  } catch (error) {
    const wrappedError =
      error instanceof Error ? error : new Error("Unexpected OAuth failure");
    clearPendingLogin(wrappedError);
    throw wrappedError;
  }
}

export function clearPendingLogin(error?: Error): void {
  if (!pendingLogin) {
    return;
  }

  if (error) {
    pendingLogin.reject(error);
  }

  pendingLogin = null;
}

function buildAuthorizationUrl(input: {
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const config = getConfig();
  const url = new URL(config.auth.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.auth.oauthClientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", config.auth.oauthScopes);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", input.state);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");

  return url.toString();
}

async function exchangeAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<OAuthTokenResponse> {
  const config = getConfig();
  return exchangeTokenGrant(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.auth.oauthClientId,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
  );
}

export async function refreshOAuthTokens(
  refreshToken: string,
): Promise<StoredAuth> {
  const config = getConfig();
  const tokenResponse = await exchangeTokenGrant(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.auth.oauthClientId,
      scope: config.auth.oauthScopes,
    }),
  );

  return persistOAuthTokens({
    idToken: tokenResponse.id_token,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
  });
}

async function exchangeTokenGrant(
  body: URLSearchParams,
): Promise<OAuthTokenResponse> {
  const config = getConfig();
  const response = await fetchWithTimeout(
    config.auth.tokenUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
    {
      timeoutMs: config.proxy.upstreamTimeoutMs,
      context: "OAuth token exchange",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OAuth token exchange failed with ${response.status}: ${errorBody}`,
    );
  }

  const json = await response.json();
  return OAuthTokenResponseSchema.parse(json);
}

async function persistOAuthTokens(tokens: PersistedTokens): Promise<StoredAuth> {
  const idTokenPayload = decodeJwtPayload(tokens.idToken);
  const accessTokenPayload = decodeJwtPayload(tokens.accessToken);
  const claims = extractAuthClaims(idTokenPayload, accessTokenPayload);

  return saveStoredAuth({
    tokens,
    claims,
    lastRefresh: new Date().toISOString(),
  });
}
