import os from "node:os";
import path from "node:path";

import { z } from "zod";

const EnvBooleanSchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  return value;
}, z.boolean());

const EnvSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(1455),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  OAI_PROXY_SERVICE_MODE: EnvBooleanSchema.default(false),
  OAI_PROXY_AUTH_ROUTES_ENABLED: EnvBooleanSchema.optional(),
  OAI_PROXY_STARTUP_LOGIN_PROMPT: EnvBooleanSchema.optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

type ParsedEnv = z.infer<typeof EnvSchema>;

export type AppConfig = {
  server: {
    host: string;
    port: number;
  };
  auth: {
    startupLoginPrompt: boolean;
    routesEnabled: boolean;
    redirectHost: string;
    callbackPath: string;
    directoryPath: string;
    filePath: string;
    codexFallbackPaths: string[];
    oauthClientId: string;
    oauthScopes: string;
    authorizeUrl: string;
    tokenUrl: string;
  };
  proxy: {
    codexResponsesUrl: string;
    supportedModels: string[];
    refreshWindowMs: number;
    upstreamTimeoutMs: number;
  };
  log: {
    level: ParsedEnv["LOG_LEVEL"];
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsedEnv = EnvSchema.parse(env);
  const serviceMode = parsedEnv.OAI_PROXY_SERVICE_MODE;
  const authDirectoryPath = path.join(os.homedir(), ".chatgpt-codex");
  const authFilePath = path.join(authDirectoryPath, "auth.json");
  const codexFallbackPaths = [
    env.CODEX_HOME ? path.join(env.CODEX_HOME, "auth.json") : null,
    path.join(os.homedir(), ".codex", "auth.json"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return {
    server: {
      host: parsedEnv.HOST,
      port: parsedEnv.PORT,
    },
    auth: {
      startupLoginPrompt:
        parsedEnv.OAI_PROXY_STARTUP_LOGIN_PROMPT ?? !serviceMode,
      routesEnabled: parsedEnv.OAI_PROXY_AUTH_ROUTES_ENABLED ?? !serviceMode,
      redirectHost: "localhost",
      callbackPath: "/auth/callback",
      directoryPath: authDirectoryPath,
      filePath: authFilePath,
      codexFallbackPaths,
      oauthClientId: "app_EMoamEEZ73f0CkXaXp7hrann",
      oauthScopes: "openid profile email offline_access",
      authorizeUrl: "https://auth.openai.com/oauth/authorize",
      tokenUrl: "https://auth.openai.com/oauth/token",
    },
    proxy: {
      codexResponsesUrl: "https://chatgpt.com/backend-api/codex/responses",
      supportedModels: ["gpt-5.4", "gpt-5.5"],
      refreshWindowMs: 5 * 60 * 1000,
      upstreamTimeoutMs: parsedEnv.UPSTREAM_TIMEOUT_MS,
    },
    log: {
      level: parsedEnv.LOG_LEVEL,
    },
  };
}

export function buildOAuthRedirectUri(config: AppConfig): string {
  return `http://${config.auth.redirectHost}:${config.server.port}${config.auth.callbackPath}`;
}
