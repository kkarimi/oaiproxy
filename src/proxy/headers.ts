import { randomUUID } from "node:crypto";

import { requireStoredAuthWithRefresh } from "../auth/token-manager.js";

export async function buildCodexUpstreamHeaders(): Promise<Record<string, string>> {
  const storedAuth = await requireStoredAuthWithRefresh();

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
