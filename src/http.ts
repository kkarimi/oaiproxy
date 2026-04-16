export async function fetchWithTimeout(
  input: string | URL | globalThis.Request,
  init: RequestInit,
  options: {
    timeoutMs: number;
    context: string;
  },
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(
        `${options.context} timed out after ${options.timeoutMs}ms`,
      );
    }

    throw error;
  }
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}
