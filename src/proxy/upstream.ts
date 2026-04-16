import type { AuthService } from "../auth/service.js";
import type { AppConfig } from "../config.js";
import { fetchWithTimeout } from "../http.js";
import { buildCodexUpstreamHeaders } from "./headers.js";

export async function sendCodexResponsesRequest(
  config: AppConfig,
  authService: AuthService,
  body: unknown,
): Promise<Response> {
  const headers = await buildCodexUpstreamHeaders(authService);

  const response = await fetchWithTimeout(
    config.proxy.codexResponsesUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    {
      timeoutMs: config.proxy.upstreamTimeoutMs,
      context: "Upstream Codex request",
    },
  );

  return response;
}
