import {
  OpenAIChatCompletionRequestSchema,
  type OpenAIChatCompletionRequest,
  type OpenAIChatMessage,
} from "../types/openai.js";
import { type CodexInputMessage, type CodexResponsesRequest } from "../types/codex.js";

export function translateChatToCodex(
  request: unknown,
): CodexResponsesRequest {
  const parsedRequest = OpenAIChatCompletionRequestSchema.parse(request);
  const instructions = extractInstructions(parsedRequest);
  const input = parsedRequest.messages
    .filter((message) => message.role !== "system")
    .map(translateMessageToCodexInput);

  if (input.length === 0) {
    throw new Error("At least one non-system message is required");
  }

  return {
    model: parsedRequest.model,
    ...(instructions ? { instructions } : {}),
    input,
    stream: true,
    store: false,
    ...(parsedRequest.max_tokens
      ? { max_output_tokens: parsedRequest.max_tokens }
      : {}),
  };
}

function extractInstructions(request: OpenAIChatCompletionRequest): string | undefined {
  const systemMessages = request.messages.filter(
    (message) => message.role === "system",
  );

  if (systemMessages.length === 0) {
    return undefined;
  }

  return systemMessages.map(normalizeMessageContent).join("\n\n");
}

function translateMessageToCodexInput(message: OpenAIChatMessage): CodexInputMessage {
  if (message.role === "system") {
    throw new Error("System messages must be converted into instructions");
  }

  return {
    type: "message",
    role: message.role,
    content: [
      {
        type: "input_text",
        text: normalizeMessageContent(message),
      },
    ],
  };
}

function normalizeMessageContent(message: OpenAIChatMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content.map((part) => part.text).join("\n");
}
