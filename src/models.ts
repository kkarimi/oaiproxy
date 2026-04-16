import type { AppConfig } from "./config.js";

export function listSupportedModels(config: AppConfig) {
  return config.proxy.supportedModels.map(createModelRecord);
}

export function isSupportedModel(config: AppConfig, model: string): boolean {
  return config.proxy.supportedModels.includes(model);
}

export function getSupportedModel(config: AppConfig, model: string) {
  if (!isSupportedModel(config, model)) {
    return null;
  }

  return createModelRecord(model);
}

function createModelRecord(id: string) {
  return {
    id,
    object: "model",
    created: 0,
    owned_by: "openai",
  };
}
