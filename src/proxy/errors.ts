import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { AuthRequiredError } from "../auth/errors.js";

export class ProxyRouteError extends Error {
  constructor(
    readonly statusCode: number,
    readonly type: string,
    message: string,
  ) {
    super(message);
    this.name = "ProxyRouteError";
  }
}

export async function proxyRouteErrorFromUpstream(
  upstreamResponse: Response,
): Promise<ProxyRouteError> {
  const errorText = await upstreamResponse.text();

  if (upstreamResponse.status === 401) {
    return new ProxyRouteError(
      401,
      "auth_error",
      "Stored ChatGPT auth was rejected by the upstream service. Re-run /auth/login or /auth/logout to reset local auth.",
    );
  }

  return new ProxyRouteError(
    upstreamResponse.status,
    "invalid_request_error",
    errorText || "Upstream Codex request failed.",
  );
}

export function sendOpenAiError(
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

export function handleOpenAiRouteError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
) {
  if (error instanceof ZodError) {
    return sendOpenAiError(
      reply,
      400,
      error.issues.map((issue) => issue.message).join("; "),
      "invalid_request_error",
    );
  }

  if (error instanceof ProxyRouteError) {
    return sendOpenAiError(reply, error.statusCode, error.message, error.type);
  }

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
