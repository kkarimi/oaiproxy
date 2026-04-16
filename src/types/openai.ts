import { z } from "zod";

const OpenAITextContentPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const OpenAIChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.union([z.string(), z.array(OpenAITextContentPartSchema)]),
});

export const OpenAIChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(OpenAIChatMessageSchema).min(1),
  stream: z.boolean().optional(),
  max_tokens: z.number().int().positive().optional(),
});

export type OpenAIChatMessage = z.infer<typeof OpenAIChatMessageSchema>;
export type OpenAIChatCompletionRequest = z.infer<
  typeof OpenAIChatCompletionRequestSchema
>;
