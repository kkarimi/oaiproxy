import { getConfig } from "./config.js";

export function listSupportedModels() {
  return getConfig().proxy.supportedModels.map((id) => ({
    id,
    object: "model",
    created: 0,
    owned_by: "openai",
  }));
}
