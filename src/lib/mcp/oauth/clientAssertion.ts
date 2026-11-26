import {
  createLocalJWKSet,
  decodeJwt,
  errors as joseErrors,
  jwtVerify,
  type JSONWebKeySet,
} from "jose";
import { fetchClientJwks, type CimdDependencies, type ResolvedOAuthClient } from "./cimd";

export const JWT_BEARER_CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

export const ALLOWED_CLIENT_ASSERTION_ALGS = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
] as const;

const REPLAY_CACHE_MAX_SIZE = 5000;
const assertionReplayCache = new Map<string, number>();

export class ClientAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientAssertionError";
  }
}

export function clearAssertionReplayCache(): void {
  assertionReplayCache.clear();
}

function pruneExpiredReplayEntries(nowMs: number): void {
  for (const [key, expiresAtMs] of assertionReplayCache.entries()) {
    if (expiresAtMs <= nowMs) {
      assertionReplayCache.delete(key);
    }
  }
}

/**
 * Extracts `sub` (or `iss` when `sub` is absent) from a JWT assertion without verifying its signature.
 * Signature and exact issuer/subject equality are strictly verified later via `verifyPrivateKeyJwtAssertion`.
 */
export function extractClientIdFromAssertion(assertion: string): string | null {
  if (!assertion || typeof assertion !== "string") {
    return null;
  }
  try {
    const payload = decodeJwt(assertion);
    const candidate =
      typeof payload.sub === "string" && payload.sub.trim()
        ? payload.sub.trim()
        : typeof payload.iss === "string" && payload.iss.trim()
          ? payload.iss.trim()
          : null;
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Verifies an RFC 7523 `private_key_jwt` client assertion against a client's inline JWKS or `jwks_uri`.
 */
export async function verifyPrivateKeyJwtAssertion(params: {
  client: ResolvedOAuthClient;
  clientAssertionType?: string | null;
  clientAssertion?: string | null;
  expectedAudiences: string[];
  deps?: CimdDependencies;
  nowMs?: number;
}): Promise<void> {
  const { client, clientAssertionType, clientAssertion, expectedAudiences, deps } = params;

  if (clientAssertionType !== JWT_BEARER_CLIENT_ASSERTION_TYPE) {
    throw new ClientAssertionError(
      `Unsupported or missing client_assertion_type; expected '${JWT_BEARER_CLIENT_ASSERTION_TYPE}'`
    );
  }

  if (!clientAssertion || !clientAssertion.trim()) {
    throw new ClientAssertionError("Missing client_assertion JWT");
  }

  if (!client.jwks && !client.jwksUri) {
    throw new ClientAssertionError(
      "Client has no JWKS configured for private_key_jwt verification"
    );
  }

  const verifyWithJwks = async (jwks: { keys: Record<string, unknown>[] }) => {
    const jwkSet = createLocalJWKSet(jwks as unknown as JSONWebKeySet);
    return jwtVerify(clientAssertion, jwkSet, {
      issuer: client.clientId,
      subject: client.clientId,
      audience: expectedAudiences,
      algorithms: [...ALLOWED_CLIENT_ASSERTION_ALGS],
      clockTolerance: 30,
    });
  };

  let verifiedPayload;
  try {
    if (client.jwks) {
      verifiedPayload = (await verifyWithJwks(client.jwks)).payload;
    } else if (client.jwksUri) {
      const jwks = await fetchClientJwks(client.jwksUri, deps);
      try {
        verifiedPayload = (await verifyWithJwks(jwks)).payload;
      } catch (err) {
        if (err instanceof joseErrors.JWKSNoMatchingKey) {
          const refreshedJwks = await fetchClientJwks(client.jwksUri, deps, { bypassCache: true });
          verifiedPayload = (await verifyWithJwks(refreshedJwks)).payload;
        } else {
          throw err;
        }
      }
    } else {
      throw new ClientAssertionError("Client has no JWKS configured");
    }
  } catch (err) {
    if (err instanceof ClientAssertionError) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : "JWT verification failed";
    throw new ClientAssertionError(`Invalid client_assertion: ${detail}`);
  }

  if (typeof verifiedPayload.exp !== "number" || !Number.isFinite(verifiedPayload.exp)) {
    throw new ClientAssertionError("client_assertion must include a numeric exp claim");
  }

  const nowMs = params.nowMs ?? (deps?.now ? deps.now() : Date.now());
  if (typeof verifiedPayload.jti === "string" && verifiedPayload.jti.trim()) {
    const replayKey = `${client.clientId}:${verifiedPayload.jti.trim()}`;
    const existingExpiry = assertionReplayCache.get(replayKey);
    if (existingExpiry !== undefined && existingExpiry > nowMs) {
      throw new ClientAssertionError("client_assertion replay detected (jti already used)");
    }
    if (assertionReplayCache.size >= REPLAY_CACHE_MAX_SIZE) {
      pruneExpiredReplayEntries(nowMs);
    }
    const expMs = Math.max(verifiedPayload.exp * 1000, nowMs + 60_000);
    assertionReplayCache.set(replayKey, expMs);
  }
}
