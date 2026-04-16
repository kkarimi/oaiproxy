import { buildCodexUpstreamHeaders } from "./headers.js";

export const CODEX_RESPONSES_URL =
  "https://chatgpt.com/backend-api/codex/responses";

export async function sendCodexResponsesRequest(body: unknown): Promise<Response> {
  const headers = await buildCodexUpstreamHeaders();

  const response = await fetch(CODEX_RESPONSES_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return response;
}
