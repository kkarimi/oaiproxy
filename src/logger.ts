import pino, { type Logger } from "pino";

import { type AppConfig } from "./config.js";

const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['chatgpt-account-id']",
  "authorization",
  "id_token",
  "access_token",
  "refresh_token",
  "tokens.id_token",
  "tokens.access_token",
  "tokens.refresh_token",
] as const;

export function createLogger(config: AppConfig): Logger {
  return pino({
    level: config.log.level,
    redact: {
      paths: [...REDACT_PATHS],
      censor: "[REDACTED]",
    },
  });
}
