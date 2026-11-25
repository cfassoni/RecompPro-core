import crypto from "crypto";

const PKCE_VERIFIER_REGEX = /^[A-Za-z0-9\-._~]{43,128}$/;

/** Verifies an OAuth 2.1 PKCE `S256` code_verifier against a stored code_challenge. */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  if (!PKCE_VERIFIER_REGEX.test(codeVerifier) || !codeChallenge) {
    return false;
  }

  const expectedChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");

  const expectedBuf = Buffer.from(expectedChallenge, "utf-8");
  const actualBuf = Buffer.from(codeChallenge, "utf-8");

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
