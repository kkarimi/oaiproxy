import { randomUUID } from "node:crypto";

type TranslationState = {
  id: string;
  created: number;
  assistantRoleSent: boolean;
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

function getObjectValue(
  value: object,
  key: string,
): Record<string, unknown> | null {
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
