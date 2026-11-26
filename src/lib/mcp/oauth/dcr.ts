import crypto from "crypto";
import { db } from "@/db/client";
import { mcpOauthClients, mcpOauthGrants } from "@/db/schema";
import { and, eq, lt, notInArray } from "drizzle-orm";
import {
  normalizeInlineJwks,
  validateHttpsJwksUri,
  type OAuthTokenEndpointAuthMethod,
} from "./cimd";

const DCR_RATE_LIMIT_MAX = 20;
const DCR_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const STALE_DCR_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const dcrRateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function resetDcrRateLimits(): void {
  dcrRateLimitMap.clear();
}

export class DcrValidationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Validates redirect URIs for public OAuth 2.1 clients (HTTPS or localhost loopback HTTP only). */
export function validateRedirectUri(uri: string): boolean {
  if (!uri || uri.length > 2048) return false;
  try {
    const parsed = new URL(uri);
    if (parsed.hash) return false;

    if (parsed.protocol === "https:") {
      return Boolean(parsed.hostname);
    }

    if (parsed.protocol === "http:") {
      const host = parsed.hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
    }

    return false;
  } catch {
    return false;
  }
}

export interface DcrRequestBody {
  client_name?: unknown;
  client_uri?: unknown;
  logo_uri?: unknown;
  redirect_uris?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  token_endpoint_auth_method?: unknown;
  jwks_uri?: unknown;
  jwks?: unknown;
  scope?: unknown;
}

export interface DcrRegistrationResponse {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: OAuthTokenEndpointAuthMethod;
  client_id_issued_at: number;
  client_uri?: string;
  logo_uri?: string;
  jwks_uri?: string;
}

/**
 * Registers a public OAuth 2.1 client via RFC 7591 Dynamic Client Registration.
 */
export async function registerDynamicClient(
  body: DcrRequestBody,
  clientIp: string
): Promise<DcrRegistrationResponse> {
  const nowMs = Date.now();
  const bucket = dcrRateLimitMap.get(clientIp);
  if (bucket && bucket.resetAt > nowMs) {
    if (bucket.count >= DCR_RATE_LIMIT_MAX) {
      throw new DcrValidationError(
        "too_many_requests",
        "Dynamic client registration rate limit exceeded",
        429
      );
    }
    bucket.count += 1;
  } else {
    dcrRateLimitMap.set(clientIp, {
      count: 1,
      resetAt: nowMs + DCR_RATE_LIMIT_WINDOW_MS,
    });
  }

  let tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod = "none";
  if (body.token_endpoint_auth_method !== undefined) {
    if (
      body.token_endpoint_auth_method !== "none" &&
      body.token_endpoint_auth_method !== "private_key_jwt"
    ) {
      throw new DcrValidationError(
        "invalid_client_metadata",
        "Supported token_endpoint_auth_method values: 'none', 'private_key_jwt'"
      );
    }
    tokenEndpointAuthMethod = body.token_endpoint_auth_method;
  }

  let validatedJwksUri: string | undefined;
  if (body.jwks_uri !== undefined && body.jwks_uri !== null && body.jwks_uri !== "") {
    const uriCheck = validateHttpsJwksUri(body.jwks_uri);
    if (!uriCheck.ok) {
      throw new DcrValidationError("invalid_client_metadata", uriCheck.error);
    }
    validatedJwksUri = uriCheck.uri;
  }

  const inlineJwks = normalizeInlineJwks(body.jwks);
  if (tokenEndpointAuthMethod === "private_key_jwt" && !validatedJwksUri && !inlineJwks) {
    throw new DcrValidationError(
      "invalid_client_metadata",
      "private_key_jwt requires a valid HTTPS jwks_uri or inline jwks with keys"
    );
  }

  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    throw new DcrValidationError(
      "invalid_redirect_uri",
      "redirect_uris must be a non-empty array"
    );
  }

  const redirectUris: string[] = [];
  for (const rawUri of body.redirect_uris) {
    if (typeof rawUri !== "string" || !validateRedirectUri(rawUri)) {
      throw new DcrValidationError(
        "invalid_redirect_uri",
        `Invalid redirect_uri: ${String(rawUri)}`
      );
    }
    redirectUris.push(rawUri);
  }

  const allowedGrantTypes = new Set(["authorization_code", "refresh_token"]);
  let grantTypes = ["authorization_code", "refresh_token"];
  if (body.grant_types !== undefined) {
    if (
      !Array.isArray(body.grant_types) ||
      body.grant_types.length === 0 ||
      body.grant_types.some((g) => typeof g !== "string" || !allowedGrantTypes.has(g))
    ) {
      throw new DcrValidationError(
        "invalid_client_metadata",
        "grant_types must be a subset of ['authorization_code', 'refresh_token']"
      );
    }
    grantTypes = body.grant_types as string[];
  }

  let responseTypes = ["code"];
  if (body.response_types !== undefined) {
    if (
      !Array.isArray(body.response_types) ||
      body.response_types.length === 0 ||
      body.response_types.some((r) => r !== "code")
    ) {
      throw new DcrValidationError(
        "invalid_client_metadata",
        "response_types must be ['code']"
      );
    }
    responseTypes = body.response_types as string[];
  }

  const clientName =
    typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name.trim().slice(0, 120)
      : "MCP Client";

  const clientUri =
    typeof body.client_uri === "string" && body.client_uri.startsWith("https://")
      ? body.client_uri
      : undefined;

  const logoUri =
    typeof body.logo_uri === "string" && body.logo_uri.startsWith("https://")
      ? body.logo_uri
      : undefined;

  const clientId = `recomp_client_${crypto.randomBytes(16).toString("hex")}`;
  const createdAt = new Date(nowMs);

  await db.insert(mcpOauthClients).values({
    clientId,
    registrationType: "dcr",
    clientName,
    clientUri: clientUri ?? null,
    logoUri: logoUri ?? null,
    redirectUrisJson: JSON.stringify(redirectUris),
    metadataJson: JSON.stringify(body),
    metadataExpiresAt: null,
    lastUsedAt: null,
    createdAt,
  });

  // Best-effort pruning of stale ungranted DCR clients older than 30 days
  pruneStaleDcrClients(nowMs).catch(() => {});

  const response: DcrRegistrationResponse = {
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    client_id_issued_at: Math.floor(nowMs / 1000),
  };

  if (clientUri) response.client_uri = clientUri;
  if (logoUri) response.logo_uri = logoUri;
  if (validatedJwksUri) response.jwks_uri = validatedJwksUri;

  return response;
}

/** Removes DCR clients older than 30 days that have no associated grants. */
export async function pruneStaleDcrClients(nowMs = Date.now()): Promise<void> {
  const cutoff = new Date(nowMs - STALE_DCR_MAX_AGE_MS);
  const activeGrants = await db
    .select({ clientId: mcpOauthGrants.clientId })
    .from(mcpOauthGrants);
  const activeIds = activeGrants.map((g) => g.clientId);

  if (activeIds.length > 0) {
    await db
      .delete(mcpOauthClients)
      .where(
        and(
          eq(mcpOauthClients.registrationType, "dcr"),
          lt(mcpOauthClients.createdAt, cutoff),
          notInArray(mcpOauthClients.clientId, activeIds)
        )
      );
  } else {
    await db
      .delete(mcpOauthClients)
      .where(
        and(
          eq(mcpOauthClients.registrationType, "dcr"),
          lt(mcpOauthClients.createdAt, cutoff)
        )
      );
  }
}
