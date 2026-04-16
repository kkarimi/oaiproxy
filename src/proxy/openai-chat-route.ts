import type { FastifyInstance, FastifyReply } from "fastify";

import type { AppServices } from "../app-services.js";
import type { AppConfig } from "../config.js";
import { OpenAIChatCompletionRequestSchema } from "../types/openai.js";
import {
  ProxyRouteError,
  handleOpenAiRouteError,
  proxyRouteErrorFromUpstream,
} from "./errors.js";
import { translateChatToCodex } from "./translate-chat-to-codex.js";
import {
  collectCodexSseToOpenAiCompletion,
  createCodexSseToOpenAiTranslator,
} from "./translate-codex-sse-to-openai.js";
import { sendCodexResponsesRequest } from "./upstream.js";

export async function registerOpenAiChatRoute(
  app: FastifyInstance<any, any, any, any>,
  config: AppConfig,
  services: AppServices,
): Promise<void> {
  app.post("/v1/chat/completions", async (request, reply) => {
    try {
      const parsedRequest = OpenAIChatCompletionRequestSchema.parse(request.body);
      const upstreamRequest = translateChatToCodex(parsedRequest);
      const upstreamResponse = await sendCodexResponsesRequest(
        config,
        services.auth,
        upstreamRequest,
      );

      if (!upstreamResponse.ok) {
        throw await proxyRouteErrorFromUpstream(upstreamResponse);
      }

      if (!upstreamResponse.body) {
        throw new ProxyRouteError(
          502,
          "invalid_request_error",
          "Upstream response body was empty.",
        );
      }

      if (parsedRequest.stream === false) {
        const completion = await collectCodexSseToOpenAiCompletion({
          upstreamResponse,
          model: parsedRequest.model,
        });

        return reply.status(200).send(completion);
      }

      return pipeCodexSseToOpenAi({
        reply,
        upstreamResponse,
        model: parsedRequest.model,
      });
    } catch (error) {
      return handleOpenAiRouteError(request, reply, error);
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
