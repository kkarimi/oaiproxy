import { getConfig } from "../config.js";
import { buildCodexUpstreamHeaders } from "./headers.js";

export async function sendCodexResponsesRequest(body: unknown): Promise<Response> {
  const headers = await buildCodexUpstreamHeaders();
  const config = getConfig();

  const response = await fetch(config.proxy.codexResponsesUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return response;
}
