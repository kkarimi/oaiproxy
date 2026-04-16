import Fastify from "fastify";

import { loadConfig } from "./config.js";

async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  app.get("/health", async () => {
    return {
      ok: true,
    };
  });

  return app;
}

async function start() {
  const config = loadConfig();
  const app = await buildServer();

  try {
    await app.listen({
      host: config.HOST,
      port: config.PORT,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
