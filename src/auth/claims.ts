import { decodeJwt, errors as joseErrors, type JWTPayload } from "jose";

import { AuthClaimsSchema, type AuthClaims } from "./schema.js";

const LEGACY_CHATGPT_ACCOUNT_ID_CLAIM =
  "https://api.openai.com/auth.chatgpt_account_id";
const LEGACY_CHATGPT_PLAN_TYPE_CLAIM =
  "https://api.openai.com/auth.chatgpt_plan_type";
const LEGACY_ORGANIZATIONS_CLAIM = "https://api.openai.com/auth.organizations";
const AUTH_CLAIM = "https://api.openai.com/auth";
const PROFILE_CLAIM = "https://api.openai.com/profile";

function getStringClaim(
  payload: JWTPayload,
  claimName: string,
): string | undefined {
  const value = payload[claimName];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getNumberClaim(
  payload: JWTPayload,
  claimName: string,
): number | undefined {
  const value = payload[claimName];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getObjectClaim(
  payload: JWTPayload,
  claimName: string,
): Record<string, unknown> | undefined {
  const value = payload[claimName];

  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function decodeJwtPayload(token: string): JWTPayload {
  try {
    return decodeJwt(token);
  } catch (error) {
    if (error instanceof joseErrors.JWTInvalid) {
      throw new Error(`Failed to decode JWT: ${error.message}`);
    }

    throw error;
  }
}

export function extractAuthClaims(
  idTokenPayload: JWTPayload,
  accessTokenPayload: JWTPayload,
): AuthClaims {
  const idTokenAuth = getObjectClaim(idTokenPayload, AUTH_CLAIM);
  const accessTokenAuth = getObjectClaim(accessTokenPayload, AUTH_CLAIM);
  const accessTokenProfile = getObjectClaim(accessTokenPayload, PROFILE_CLAIM);
  const chatgptAccountId =
    getNestedStringClaim(idTokenAuth, "chatgpt_account_id") ??
    getNestedStringClaim(accessTokenAuth, "chatgpt_account_id") ??
    getStringClaim(idTokenPayload, LEGACY_CHATGPT_ACCOUNT_ID_CLAIM);
  const expiresAt = accessTokenPayload.exp ?? getNumberClaim(idTokenPayload, "exp");

  if (!chatgptAccountId) {
    throw new Error("Missing chatgpt account id in id_token claims");
  }

  if (!expiresAt) {
    throw new Error("Missing JWT expiry in token claims");
  }

  return AuthClaimsSchema.parse({
    email:
      getStringClaim(idTokenPayload, "email") ??
      getNestedStringClaim(accessTokenProfile, "email"),
    name: getStringClaim(idTokenPayload, "name"),
    sub: getStringClaim(idTokenPayload, "sub"),
    plan_type:
      getNestedStringClaim(idTokenAuth, "chatgpt_plan_type") ??
      getNestedStringClaim(accessTokenAuth, "chatgpt_plan_type") ??
      getStringClaim(idTokenPayload, LEGACY_CHATGPT_PLAN_TYPE_CLAIM),
    chatgpt_account_id: chatgptAccountId,
    expires_at: expiresAt,
    organizations:
      idTokenAuth?.organizations ?? idTokenPayload[LEGACY_ORGANIZATIONS_CLAIM],
  });
}

function getNestedStringClaim(
  value: Record<string, unknown> | undefined,
  claimName: string,
): string | undefined {
  const claim = value?.[claimName];
  return typeof claim === "string" && claim.length > 0 ? claim : undefined;
}
