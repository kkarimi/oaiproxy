import {
  OpenAIChatCompletionRequestSchema,
  type OpenAIChatContentPart,
  type OpenAIChatCompletionRequest,
  type OpenAIChatMessage,
} from "../types/openai.js";
import {
  type CodexInputMessage,
  type CodexInputPart,
  type CodexResponsesRequest,
} from "../types/codex.js";
import { ProxyRouteError } from "./errors.js";

export function translateChatToCodex(
  request: unknown,
): CodexResponsesRequest {
  const parsedRequest = OpenAIChatCompletionRequestSchema.parse(request);
  const instructions = extractInstructions(parsedRequest);
  const input = parsedRequest.messages
    .filter((message) => message.role !== "system")
    .map(translateMessageToCodexInput);

  if (input.length === 0) {
    throw new ProxyRouteError(
      400,
      "invalid_request_error",
      "At least one non-system message is required",
    );
  }

  return {
    model: parsedRequest.model,
    instructions: instructions ?? "",
    input,
    stream: true,
    store: false,
    ...(parsedRequest.max_tokens ? { max_output_tokens: parsedRequest.max_tokens } : {}),
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
    content: translateContentParts(message.content),
  };
}

function normalizeMessageContent(message: OpenAIChatMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content.map((part) => {
    if (part.type !== "text") {
      throw new ProxyRouteError(
        400,
        "invalid_request_error",
        "System messages only support text content",
      );
    }
    return part.text;
  }).join("\n");
}

function translateContentParts(content: OpenAIChatMessage["content"]): CodexInputPart[] {
  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }

  return content.map(translateContentPart);
}

function translateContentPart(part: OpenAIChatContentPart): CodexInputPart {
  if (part.type === "text") {
    return {
      type: "input_text",
      text: part.text,
    };
  }

  return {
    type: "input_image",
    image_url: part.image_url.url,
    ...(part.image_url.detail ? { detail: part.image_url.detail } : {}),
  };
}
