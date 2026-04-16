import { createHash, randomBytes } from "node:crypto";

export type PkceChallenge = {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
};

export function createPkceChallenge(): PkceChallenge {
  const codeVerifier = randomBytes(48).toString("base64url");
  const state = randomBytes(24).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return {
    codeVerifier,
    codeChallenge,
    state,
  };
}
