import { randomUUID } from "node:crypto";

import type { AuthServiceLike } from "../auth/service.js";

export async function buildCodexUpstreamHeaders(
  authService: AuthServiceLike,
): Promise<Record<string, string>> {
  const storedAuth = await authService.requireStoredAuthWithRefresh();

  return {
    authorization: `Bearer ${storedAuth.tokens.access_token}`,
    "content-type": "application/json",
    accept: "text/event-stream",
    "openai-beta": "responses=experimental",
    "chatgpt-account-id": storedAuth.tokens.account_id,
    session_id: randomUUID(),
    conversation_id: randomUUID(),
  };
}
