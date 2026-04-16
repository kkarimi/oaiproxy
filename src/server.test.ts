import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

test("buildServer serves health and models routes", async (t) => {
  const app = await buildServer(
    loadConfig({
      ...process.env,
      LOG_LEVEL: "silent",
    }),
  );

  t.after(async () => {
    await app.close();
  });

  const healthResponse = await app.inject({
    method: "GET",
    url: "/health",
  });
  assert.equal(healthResponse.statusCode, 200);
  assert.deepEqual(healthResponse.json(), { ok: true });

  const modelsResponse = await app.inject({
    method: "GET",
    url: "/v1/models",
  });
  assert.equal(modelsResponse.statusCode, 200);
  assert.deepEqual(modelsResponse.json(), {
    object: "list",
    data: [
      {
        id: "gpt-5.4",
        object: "model",
        created: 0,
        owned_by: "openai",
      },
    ],
  });
});
