import Fastify from "fastify";

import { beginOAuthLogin, completeOAuthLogin } from "./auth/oauth.js";
import { maybePromptForLoginOnStartup } from "./auth/startup.js";
import { getAuthStatus } from "./auth/status.js";
import { clearStoredAuth } from "./auth/token-store.js";
import {
  buildOAuthRedirectUri,
  loadConfig,
  type AppConfig,
} from "./config.js";
import { createLogger } from "./logger.js";
import { listSupportedModels } from "./models.js";
import { registerOpenAiChatRoute } from "./proxy/openai-chat-route.js";

async function buildServer(config: AppConfig) {
  const logger = createLogger(config);
  const app = Fastify({
    loggerInstance: logger,
  });

  app.get("/health", async () => {
    return {
      ok: true,
    };
  });

  app.get("/v1/models", async () => {
    return {
      object: "list",
      data: listSupportedModels(),
    };
  });

  app.get("/auth/status", async () => {
    return getAuthStatus();
  });

  app.post("/auth/logout", async (_, reply) => {
    await clearStoredAuth();

    return reply.status(200).send({
      ok: true,
    });
  });

  app.post("/auth/login", async (_, reply) => {
    const login = await beginOAuthLogin({
      redirectUri: buildOAuthRedirectUri(config),
      openBrowserWindow: true,
    });

    return reply.status(202).send({
      ok: true,
      authorization_url: login.authorizationUrl,
    });
  });

  app.get("/auth/callback", async (request, reply) => {
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    if (query.error) {
      const description = query.error_description ?? "Unknown OAuth error";
      return reply.status(400).type("text/html").send(
        renderCallbackPage({
          title: "Authentication failed",
          body: `${query.error}: ${description}`,
        }),
      );
    }

    if (!query.code || !query.state) {
      return reply.status(400).type("text/html").send(
        renderCallbackPage({
          title: "Missing callback parameters",
          body: "The OAuth callback did not include both code and state.",
        }),
      );
    }

    try {
      const storedAuth = await completeOAuthLogin({
        code: query.code,
        state: query.state,
      });

      return reply.type("text/html").send(
        renderCallbackPage({
          title: "Authentication complete",
          body: `Authenticated ${storedAuth.claims.email ?? "ChatGPT account"}. You can return to the terminal.`,
        }),
      );
    } catch (error) {
      request.log.error(error);

      return reply.status(500).type("text/html").send(
        renderCallbackPage({
          title: "Authentication failed",
          body:
            error instanceof Error
              ? error.message
              : "Unexpected OAuth callback failure.",
        }),
      );
    }
  });

  await registerOpenAiChatRoute(app);

  return app;
}

async function start() {
  const config = loadConfig();
  const app = await buildServer(config);
  const startupLogger = app.log.child({ component: "startup" });
  installSignalHandlers(app);

  try {
    await app.listen({
      host: config.server.host,
      port: config.server.port,
    });
    if (config.auth.startupLoginPrompt) {
      await maybePromptForLoginOnStartup(config, startupLogger);
    }
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();

function renderCallbackPage(input: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f6f0;
        color: #171717;
      }
      main {
        max-width: 640px;
        margin: 64px auto;
        padding: 32px;
        background: #ffffff;
        border: 1px solid #dcd7cf;
        border-radius: 18px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
      }
      h1 {
        margin-top: 0;
      }
      p {
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.body)}</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function installSignalHandlers(app: Awaited<ReturnType<typeof buildServer>>) {
  let shuttingDown = false;

  const handleSignal = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    void (async () => {
      try {
        app.log.info({ signal }, "Shutting down server");
        await app.close();
        process.exit(0);
      } catch (error) {
        app.log.error(error, "Failed to shut down cleanly");
        process.exit(1);
      }
    })();
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
}
