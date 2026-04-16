import { decodeJwt, errors as joseErrors, type JWTPayload } from "jose";

import { AuthClaimsSchema, type AuthClaims } from "./schema.js";

const CHATGPT_ACCOUNT_ID_CLAIM =
  "https://api.openai.com/auth.chatgpt_account_id";
const CHATGPT_PLAN_TYPE_CLAIM = "https://api.openai.com/auth.chatgpt_plan_type";
const ORGANIZATIONS_CLAIM = "https://api.openai.com/auth.organizations";

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
  const chatgptAccountId = getStringClaim(
    idTokenPayload,
    CHATGPT_ACCOUNT_ID_CLAIM,
  );
  const expiresAt = accessTokenPayload.exp ?? getNumberClaim(idTokenPayload, "exp");

  if (!chatgptAccountId) {
    throw new Error("Missing chatgpt account id in id_token claims");
  }

  if (!expiresAt) {
    throw new Error("Missing JWT expiry in token claims");
  }

  return AuthClaimsSchema.parse({
    email: getStringClaim(idTokenPayload, "email"),
    name: getStringClaim(idTokenPayload, "name"),
    sub: getStringClaim(idTokenPayload, "sub"),
    plan_type: getStringClaim(idTokenPayload, CHATGPT_PLAN_TYPE_CLAIM),
    chatgpt_account_id: chatgptAccountId,
    expires_at: expiresAt,
    organizations: idTokenPayload[ORGANIZATIONS_CLAIM],
  });
}

