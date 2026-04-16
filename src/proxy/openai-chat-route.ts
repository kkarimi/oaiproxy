import type { FastifyInstance, FastifyReply } from "fastify";

import { AuthRequiredError } from "../auth/errors.js";
import { OpenAIChatCompletionRequestSchema } from "../types/openai.js";
import { translateChatToCodex } from "./translate-chat-to-codex.js";
import {
  collectCodexSseToOpenAiCompletion,
  createCodexSseToOpenAiTranslator,
} from "./translate-codex-sse-to-openai.js";
import { sendCodexResponsesRequest } from "./upstream.js";

export async function registerOpenAiChatRoute(
  app: FastifyInstance<any, any, any, any>,
): Promise<void> {
  app.post("/v1/chat/completions", async (request, reply) => {
    let parsedRequest;

    try {
      parsedRequest = OpenAIChatCompletionRequestSchema.parse(request.body);
    } catch (error) {
      return sendOpenAiError(
        reply,
        400,
        error instanceof Error ? error.message : "Invalid request body",
      );
    }

    try {
      const upstreamRequest = translateChatToCodex(parsedRequest);
      const upstreamResponse = await sendCodexResponsesRequest(upstreamRequest);

      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text();

        if (upstreamResponse.status === 401) {
          return sendOpenAiError(
            reply,
            401,
            "Stored ChatGPT auth was rejected by the upstream service. Re-run /auth/login or /auth/logout to reset local auth.",
            "auth_error",
          );
        }

        return sendOpenAiError(
          reply,
          upstreamResponse.status,
          errorText || "Upstream Codex request failed.",
        );
      }

      if (!upstreamResponse.body) {
        return sendOpenAiError(reply, 502, "Upstream response body was empty.");
      }

      if (parsedRequest.stream === false) {
        const completion = await collectCodexSseToOpenAiCompletion({
          upstreamResponse,
          model: parsedRequest.model,
        });

        return reply.status(200).send(completion);
      }

      await pipeCodexSseToOpenAi({
        reply,
        upstreamResponse,
        model: parsedRequest.model,
      });
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        return sendOpenAiError(reply, 401, error.message, "auth_error");
      }

      request.log.error(error);
      return sendOpenAiError(
        reply,
        500,
        error instanceof Error ? error.message : "Unexpected proxy failure",
      );
    }
  });
}

async function pipeCodexSseToOpenAi(input: {
  reply: FastifyReply;
  upstreamResponse: Response;
  model: string;
}): Promise<void> {
  const translator = createCodexSseToOpenAiTranslator(input.model);
  const reader = input.upstreamResponse.body?.getReader();

  if (!reader) {
    throw new Error("Upstream response body reader was not available");
  }

  input.reply.hijack();
  input.reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });

  const decoder = new TextDecoder();
  let buffer = "";

  try {
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

        for (const chunk of translator.translateEventBlock(eventBlock)) {
          input.reply.raw.write(chunk);
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim().length > 0) {
      for (const chunk of translator.translateEventBlock(buffer)) {
        input.reply.raw.write(chunk);
      }
    }
  } finally {
    input.reply.raw.end();
  }
}

function sendOpenAiError(
  reply: FastifyReply,
  statusCode: number,
  message: string,
  type = "invalid_request_error",
) {
  return reply.status(statusCode).send({
    error: {
      message,
      type,
    },
  });
}
