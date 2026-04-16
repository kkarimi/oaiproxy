import assert from "node:assert/strict";
import test from "node:test";

import { translateChatToCodex } from "./translate-chat-to-codex.js";

test("translateChatToCodex maps OpenAI chat requests into Codex requests", () => {
  const result = translateChatToCodex({
    model: "gpt-5.4",
    stream: true,
    max_tokens: 256,
    messages: [
      { role: "system", content: "Be concise." },
      { role: "user", content: "Summarize this." },
      {
        role: "assistant",
        content: [{ type: "text", text: "Prior answer." }],
      },
    ],
  });

  assert.deepEqual(result, {
    model: "gpt-5.4",
    instructions: "Be concise.",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Summarize this." }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "input_text", text: "Prior answer." }],
      },
    ],
    stream: true,
    store: false,
    max_output_tokens: 256,
  });
});
