import assert from "node:assert/strict";
import test from "node:test";

import {
  collectCodexSseToOpenAiCompletion,
  createCodexSseToOpenAiTranslator,
} from "./translate-codex-sse-to-openai.js";

test("createCodexSseToOpenAiTranslator emits OpenAI SSE chunks and DONE", () => {
  const translator = createCodexSseToOpenAiTranslator("gpt-5.4");

  translator.translateEventBlock(
    'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_123","created_at":123}}\n\n',
  );

  const deltaChunks = translator.translateEventBlock(
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
  );
  const completedChunks = translator.translateEventBlock(
    'event: response.completed\ndata: {"type":"response.completed","response":{}}\n\n',
  );

  assert.equal(deltaChunks.length, 2);
  assert.match(deltaChunks[0], /"role":"assistant"/);
  assert.match(deltaChunks[1], /"content":"Hello"/);
  assert.match(completedChunks[0], /"finish_reason":"stop"/);
  assert.equal(completedChunks[1], "data: [DONE]\n\n");
});

test("collectCodexSseToOpenAiCompletion builds a non-stream completion object", async () => {
  const upstreamBody = [
    'event: response.created',
    'data: {"type":"response.created","response":{"id":"resp_123","created_at":123}}',
    "",
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"Hello"}',
    "",
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":" world"}',
    "",
    'event: response.completed',
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":2,"total_tokens":12}}}',
    "",
  ].join("\n");

  const completion = await collectCodexSseToOpenAiCompletion({
    upstreamResponse: new Response(upstreamBody),
    model: "gpt-5.4",
  });

  assert.deepEqual(completion, {
    id: "resp_123",
    object: "chat.completion",
    created: 123,
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "Hello world",
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 2,
      total_tokens: 12,
    },
  });
});
