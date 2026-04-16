import { randomUUID } from "node:crypto";

type TranslationState = {
  id: string;
  created: number;
  assistantRoleSent: boolean;
};

type CompletionCollectionState = {
  id: string;
  created: number;
  contentParts: string[];
  finishReason: "stop" | null;
  usage:
    | {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      }
    | undefined;
};

export function createCodexSseToOpenAiTranslator(model: string) {
  const state: TranslationState = {
    id: `chatcmpl_${randomUUID()}`,
    created: Math.floor(Date.now() / 1000),
    assistantRoleSent: false,
  };

  return {
    translateEventBlock(eventBlock: string): string[] {
      const parsedEvent = parseSseEventBlock(eventBlock);

      if (!parsedEvent) {
        return [];
      }

      const payload = tryParseJson(parsedEvent.data);

      if (!payload || typeof payload !== "object") {
        return [];
      }

      const payloadRecord = payload as Record<string, unknown>;

      const eventType =
        (typeof payloadRecord.type === "string" && payloadRecord.type) ||
        parsedEvent.event;

      if (eventType === "response.created") {
        const response = getObjectValue(payloadRecord, "response");
        const responseId = getStringValue(response, "id");
        const createdAt = getNumberValue(response, "created_at");

        if (responseId) {
          state.id = responseId;
        }

        if (createdAt) {
          state.created = createdAt;
        }

        return [];
      }

      if (eventType === "response.output_text.delta") {
        const delta = getStringValue(payloadRecord, "delta");

        if (!delta) {
          return [];
        }

        const chunks: string[] = [];

        if (!state.assistantRoleSent) {
          chunks.push(
            formatOpenAiChunk({
              id: state.id,
              created: state.created,
              model,
              delta: {
                role: "assistant",
              },
              finishReason: null,
            }),
          );
          state.assistantRoleSent = true;
        }

        chunks.push(
          formatOpenAiChunk({
            id: state.id,
            created: state.created,
            model,
            delta: {
              content: delta,
            },
            finishReason: null,
          }),
        );

        return chunks;
      }

      if (eventType === "response.completed") {
        return [
          formatOpenAiChunk({
            id: state.id,
            created: state.created,
            model,
            delta: {},
            finishReason: "stop",
          }),
          "data: [DONE]\n\n",
        ];
      }

      return [];
    },
  };
}

export async function collectCodexSseToOpenAiCompletion(input: {
  upstreamResponse: Response;
  model: string;
}): Promise<Record<string, unknown>> {
  const reader = input.upstreamResponse.body?.getReader();

  if (!reader) {
    throw new Error("Upstream response body reader was not available");
  }

  const state: CompletionCollectionState = {
    id: `chatcmpl_${randomUUID()}`,
    created: Math.floor(Date.now() / 1000),
    contentParts: [],
    finishReason: null,
    usage: undefined,
  };

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");

    while (true) {
      const delimiterIndex = buffer.indexOf("\n\n");

      if (delimiterIndex === -1) {
        break;
      }

      const eventBlock = buffer.slice(0, delimiterIndex);
      buffer = buffer.slice(delimiterIndex + 2);
      collectEventBlock(state, eventBlock);
    }
  }

  buffer += decoder.decode();

  if (buffer.trim().length > 0) {
    collectEventBlock(state, buffer);
  }

  return {
    id: state.id,
    object: "chat.completion",
    created: state.created,
    model: input.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: state.contentParts.join(""),
        },
        finish_reason: state.finishReason ?? "stop",
      },
    ],
    ...(state.usage ? { usage: state.usage } : {}),
  };
}

function formatOpenAiChunk(input: {
  id: string;
  created: number;
  model: string;
  delta: Record<string, string>;
  finishReason: "stop" | null;
}): string {
  return `data: ${JSON.stringify({
    id: input.id,
    object: "chat.completion.chunk",
    created: input.created,
    model: input.model,
    choices: [
      {
        index: 0,
        delta: input.delta,
        finish_reason: input.finishReason,
      },
    ],
  })}\n\n`;
}

function parseSseEventBlock(
  eventBlock: string,
): { event: string | null; data: string } | null {
  const lines = eventBlock
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  let event: string | null = null;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function collectEventBlock(
  state: CompletionCollectionState,
  eventBlock: string,
): void {
  const parsedEvent = parseSseEventBlock(eventBlock);

  if (!parsedEvent) {
    return;
  }

  const payload = tryParseJson(parsedEvent.data);

  if (!payload || typeof payload !== "object") {
    return;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const eventType =
    (typeof payloadRecord.type === "string" && payloadRecord.type) ||
    parsedEvent.event;

  if (eventType === "response.created") {
    const response = getObjectValue(payloadRecord, "response");
    const responseId = getStringValue(response, "id");
    const createdAt = getNumberValue(response, "created_at");

    if (responseId) {
      state.id = responseId;
    }

    if (createdAt) {
      state.created = createdAt;
    }

    return;
  }

  if (eventType === "response.output_text.delta") {
    const delta = getStringValue(payloadRecord, "delta");

    if (delta) {
      state.contentParts.push(delta);
    }

    return;
  }

  if (eventType === "response.completed") {
    const response = getObjectValue(payloadRecord, "response");
    const usage = getObjectValue(response, "usage");
    const inputTokens = getNumberValue(usage, "input_tokens");
    const outputTokens = getNumberValue(usage, "output_tokens");
    const totalTokens = getNumberValue(usage, "total_tokens");

    state.finishReason = "stop";

    if (
      typeof inputTokens === "number" &&
      typeof outputTokens === "number" &&
      typeof totalTokens === "number"
    ) {
      state.usage = {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: totalTokens,
      };
    }
  }
}

function getObjectValue(
  value: object | null,
  key: string,
): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  const nestedValue = (value as Record<string, unknown>)[key];

  return typeof nestedValue === "object" &&
    nestedValue !== null &&
    !Array.isArray(nestedValue)
    ? (nestedValue as Record<string, unknown>)
    : null;
}

function getStringValue(
  value: object | null,
  key: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const nestedValue = (value as Record<string, unknown>)[key];
  return typeof nestedValue === "string" && nestedValue.length > 0
    ? nestedValue
    : undefined;
}

function getNumberValue(
  value: object | null,
  key: string,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const nestedValue = (value as Record<string, unknown>)[key];
  return typeof nestedValue === "number" && Number.isFinite(nestedValue)
    ? nestedValue
    : undefined;
}
