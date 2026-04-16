import type { AppConfig } from "./config.js";

export function listSupportedModels(config: AppConfig) {
  return config.proxy.supportedModels.map((id) => ({
    id,
    object: "model",
    created: 0,
    owned_by: "openai",
  }));
}
