import { z } from "zod";

export const AuthClaimsSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
  sub: z.string().optional(),
  plan_type: z.string().optional(),
  chatgpt_account_id: z.string(),
  expires_at: z.number().int().positive(),
  organizations: z.unknown().optional(),
});

export const StoredAuthSchema = z.object({
  provider: z.literal("openai-chatgpt-subscription"),
  version: z.literal(1),
  tokens: z.object({
    id_token: z.string().min(1),
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    account_id: z.string().min(1),
  }),
  claims: AuthClaimsSchema,
  last_refresh: z.string().datetime().nullable(),
});

export type AuthClaims = z.infer<typeof AuthClaimsSchema>;
export type StoredAuth = z.infer<typeof StoredAuthSchema>;

