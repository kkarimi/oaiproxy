import { z } from "zod";

import type { AppConfig } from "../config.js";
import { fetchWithTimeout } from "../http.js";
import { buildAuthStatus, buildMissingAuthStatus, type AuthStatus } from "./status.js";
import { decodeJwtPayload, extractAuthClaims } from "./claims.js";
import { AuthRequiredError } from "./errors.js";
import { openBrowser } from "./browser.js";
import { createPkceChallenge } from "./pkce.js";
import { shouldRefreshStoredAuth, isStoredAuthExpired } from "./token-manager.js";
import {
  clearStoredAuth,
  loadStoredAuth,
  loadStoredAuthWithSource,
  saveStoredAuth,
  type PersistedTokens,
} from "./token-store.js";
import { type StoredAuth } from "./schema.js";

const OAuthTokenResponseSchema = z.object({
  id_token: z.string().min(1),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});
type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;
export type AuthLoginResult = {
  authorizationUrl: string;
  completion: Promise<StoredAuth>;
};
export type AuthRefreshResult = {
  storedAuth: StoredAuth | null;
  refreshed: boolean;
  refreshError: Error | null;
};
export type AuthServiceLike = {
  getStatus(now?: Date): Promise<AuthStatus>;
  clearStoredAuth(): Promise<void>;
  beginLogin(options: {
    redirectUri: string;
    openBrowserWindow?: boolean;
  }): Promise<AuthLoginResult>;
  completeLogin(input: { code: string; state: string }): Promise<StoredAuth>;
  getStoredAuthWithRefresh(now?: Date): Promise<AuthRefreshResult>;
  requireStoredAuthWithRefresh(now?: Date): Promise<StoredAuth>;
};

type PendingLogin = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  authorizationUrl: string;
  completion: Promise<StoredAuth>;
  resolve: (auth: StoredAuth) => void;
  reject: (error: Error) => void;
};

export class AuthService implements AuthServiceLike {
  private pendingLogin: PendingLogin | null = null;

  constructor(private readonly config: AppConfig) {}

  async getStatus(now = new Date()): Promise<AuthStatus> {
    const loadedAuth = await loadStoredAuthWithSource(this.config);

    if (!loadedAuth) {
      return buildMissingAuthStatus(this.config.auth.filePath);
    }

    return buildAuthStatus(loadedAuth.storedAuth, loadedAuth.sourcePath, now);
  }

  async clearStoredAuth(): Promise<void> {
    await clearStoredAuth(this.config);
  }

  async beginLogin(options: {
    redirectUri: string;
    openBrowserWindow?: boolean;
  }): Promise<AuthLoginResult> {
    if (this.pendingLogin) {
      return {
        authorizationUrl: this.pendingLogin.authorizationUrl,
        completion: this.pendingLogin.completion,
      };
    }

    const pkce = createPkceChallenge();
    const authorizationUrl = this.buildAuthorizationUrl({
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

    this.pendingLogin = {
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
        this.clearPendingLogin(error instanceof Error ? error : undefined);
        throw error;
      }
    }

    return {
      authorizationUrl,
      completion,
    };
  }

  async completeLogin(input: {
    code: string;
    state: string;
  }): Promise<StoredAuth> {
    const currentLogin = this.pendingLogin;

    if (!currentLogin) {
      throw new Error("No OAuth login is currently pending");
    }

    if (currentLogin.state !== input.state) {
      throw new Error("OAuth state mismatch");
    }

    try {
      const tokenResponse = await this.exchangeAuthorizationCode({
        code: input.code,
        codeVerifier: currentLogin.codeVerifier,
        redirectUri: currentLogin.redirectUri,
      });

      const storedAuth = await this.persistOAuthTokens({
        idToken: tokenResponse.id_token,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
      });
      this.clearPendingLogin();
      currentLogin.resolve(storedAuth);

      return storedAuth;
    } catch (error) {
      const wrappedError =
        error instanceof Error ? error : new Error("Unexpected OAuth failure");
      this.clearPendingLogin(wrappedError);
      throw wrappedError;
    }
  }

  async getStoredAuthWithRefresh(
    now = new Date(),
  ): Promise<AuthRefreshResult> {
    const storedAuth = await loadStoredAuth(this.config);

    if (!storedAuth) {
      return {
        storedAuth: null,
        refreshed: false,
        refreshError: null,
      };
    }

    if (
      !shouldRefreshStoredAuth(
        storedAuth,
        this.config.proxy.refreshWindowMs,
        now,
      )
    ) {
      return {
        storedAuth,
        refreshed: false,
        refreshError: null,
      };
    }

    try {
      const refreshedAuth = await this.refreshTokens(
        storedAuth.tokens.refresh_token,
      );
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

  async requireStoredAuthWithRefresh(now = new Date()): Promise<StoredAuth> {
    const result = await this.getStoredAuthWithRefresh(now);

    if (!result.storedAuth) {
      throw new AuthRequiredError();
    }

    return result.storedAuth;
  }

  private clearPendingLogin(error?: Error): void {
    if (!this.pendingLogin) {
      return;
    }

    if (error) {
      this.pendingLogin.reject(error);
    }

    this.pendingLogin = null;
  }

  private buildAuthorizationUrl(input: {
    redirectUri: string;
    codeChallenge: string;
    state: string;
  }): string {
    const url = new URL(this.config.auth.authorizeUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.auth.oauthClientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("scope", this.config.auth.oauthScopes);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", input.state);
    url.searchParams.set("id_token_add_organizations", "true");
    url.searchParams.set("codex_cli_simplified_flow", "true");

    return url.toString();
  }

  private async exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OAuthTokenResponse> {
    return this.exchangeTokenGrant(
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.config.auth.oauthClientId,
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      }),
    );
  }

  private async refreshTokens(refreshToken: string): Promise<StoredAuth> {
    const tokenResponse = await this.exchangeTokenGrant(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.config.auth.oauthClientId,
        scope: this.config.auth.oauthScopes,
      }),
    );

    return this.persistOAuthTokens({
      idToken: tokenResponse.id_token,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
    });
  }

  private async exchangeTokenGrant(
    body: URLSearchParams,
  ): Promise<OAuthTokenResponse> {
    const response = await fetchWithTimeout(
      this.config.auth.tokenUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      },
      {
        timeoutMs: this.config.proxy.upstreamTimeoutMs,
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

  private async persistOAuthTokens(tokens: PersistedTokens): Promise<StoredAuth> {
    const idTokenPayload = decodeJwtPayload(tokens.idToken);
    const accessTokenPayload = decodeJwtPayload(tokens.accessToken);
    const claims = extractAuthClaims(idTokenPayload, accessTokenPayload);

    return saveStoredAuth(this.config, {
      tokens,
      claims,
      lastRefresh: new Date().toISOString(),
    });
  }
}
