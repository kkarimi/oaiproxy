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

test("translateChatToCodex preserves multimodal chat content order", () => {
  const result = translateChatToCodex({
    model: "gpt-5.5",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image." },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,iVBORw0KGgo=",
              detail: "low",
            },
          },
          { type: "text", text: "Return JSON." },
        ],
      },
    ],
  });

  assert.deepEqual(result.input, [
    {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: "Describe this image." },
        {
          type: "input_image",
          image_url: "data:image/png;base64,iVBORw0KGgo=",
          detail: "low",
        },
        { type: "input_text", text: "Return JSON." },
      ],
    },
  ]);
});

test("translateChatToCodex rejects image content in system instructions", () => {
  assert.throws(() => translateChatToCodex({
    model: "gpt-5.5",
    messages: [
      {
        role: "system",
        content: [
          {
            type: "image_url",
            image_url: { url: "https://example.test/image.png" },
          },
        ],
      },
      { role: "user", content: "hello" },
    ],
  }), /System messages only support text content/);
});
