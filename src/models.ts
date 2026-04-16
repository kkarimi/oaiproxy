export const SUPPORTED_MODEL_IDS = ["gpt-5.4"] as const;

export function listSupportedModels() {
  return SUPPORTED_MODEL_IDS.map((id) => ({
    id,
    object: "model",
    created: 0,
    owned_by: "openai",
  }));
}
