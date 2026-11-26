import crypto from "crypto";
import { db } from "@/db/client";
import {
  mcpOauthAuthCodes,
  mcpOauthClients,
  mcpOauthGrants,
  mcpOauthTokens,
  mcpPersonalAccessTokens,
} from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  getAccessTokenTtlSeconds,
  getRefreshTokenTtlDays,
} from "@/lib/mcp/config";
import {
  isCimdClientId,
  normalizeInlineJwks,
  resolveClientAuthMethods,
  resolveCimdClient,
  type CimdDependencies,
  type JwksDocument,
  type OAuthTokenEndpointAuthMethod,
  type ResolvedOAuthClient,
} from "./cimd";
import {
  ClientAssertionError,
  extractClientIdFromAssertion,
  verifyPrivateKeyJwtAssertion,
} from "./clientAssertion";
import { verifyPkceS256 } from "./pkce";
import { parseRequestedScopes } from "@/lib/mcp/scopes";

export const ACCESS_TOKEN_PREFIX = "recomp_at_";
export const REFRESH_TOKEN_PREFIX = "recomp_rt_";
export const PAT_TOKEN_PREFIX = "recomp_pat_";

const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class OAuthTokenError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Computes a lowercase SHA-256 hex digest for digest-only persistence. */
export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf-8").digest("hex");
}

/** Generates a high-entropy opaque secret token with the given prefix. */
export function generateOpaqueToken(prefix = ""): string {
  return `${prefix}${crypto.randomBytes(36).toString("base64url")}`;
}

/** Resolves either a CIMD HTTPS URL client or a DCR-registered client from storage. */
export async function resolveOAuthClient(
  clientId: string,
  deps?: CimdDependencies
): Promise<ResolvedOAuthClient> {
  if (!clientId) {
    throw new OAuthTokenError("invalid_client", "Missing client_id");
  }

  if (isCimdClientId(clientId)) {
    try {
      return await resolveCimdClient(clientId, deps);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to resolve CIMD client";
      throw new OAuthTokenError("invalid_client", msg);
    }
  }

  const row = await db.query.mcpOauthClients.findFirst({
    where: eq(mcpOauthClients.clientId, clientId),
  });

  if (!row) {
    throw new OAuthTokenError("invalid_client", "Unknown client_id");
  }

  let redirectUris: string[] = [];
  try {
    redirectUris = JSON.parse(row.redirectUrisJson) as string[];
  } catch {
    redirectUris = [];
  }

  let tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod = "none";
  let allowedAuthMethods: OAuthTokenEndpointAuthMethod[] = ["none"];
  let jwksUri: string | null = null;
  let jwks: JwksDocument | null = null;

  if (row.metadataJson) {
    try {
      const meta = JSON.parse(row.metadataJson) as {
        token_endpoint_auth_method?: unknown;
        token_endpoint_auth_methods_supported?: unknown;
        jwks_uri?: unknown;
        jwks?: unknown;
      };
      if (typeof meta.jwks_uri === "string" && meta.jwks_uri.startsWith("https://")) {
        jwksUri = meta.jwks_uri;
      }
      jwks = normalizeInlineJwks(meta.jwks);
      const authConfig = resolveClientAuthMethods({
        tokenEndpointAuthMethod: meta.token_endpoint_auth_method,
        tokenEndpointAuthMethodsSupported: meta.token_endpoint_auth_methods_supported,
        jwksUri,
        jwks,
        sourceLabel: row.registrationType.toUpperCase(),
      });
      tokenEndpointAuthMethod = authConfig.tokenEndpointAuthMethod;
      allowedAuthMethods = authConfig.allowedAuthMethods;
    } catch {
      tokenEndpointAuthMethod = "none";
      allowedAuthMethods = ["none"];
      jwksUri = null;
      jwks = null;
    }
  }

  return {
    clientId: row.clientId,
    registrationType: row.registrationType as "cimd" | "dcr",
    clientName: row.clientName,
    clientUri: row.clientUri,
    logoUri: row.logoUri,
    redirectUris,
    tokenEndpointAuthMethod,
    allowedAuthMethods,
    jwksUri,
    jwks,
  };
}

async function authenticateTokenEndpointClient(params: {
  bodyClientId?: string | null;
  fallbackClientId?: string | null;
  clientAssertionType?: string | null;
  clientAssertion?: string | null;
  canonicalOrigin: string;
  cimdDeps?: CimdDependencies;
}): Promise<string> {
  const bodyClientId = params.bodyClientId?.trim() || "";
  const clientAssertion = params.clientAssertion?.trim() || "";
  const clientAssertionType = params.clientAssertionType?.trim() || "";

  let assertionClientId: string | null = null;
  if (clientAssertion) {
    assertionClientId = extractClientIdFromAssertion(clientAssertion);
    if (!assertionClientId) {
      throw new OAuthTokenError("invalid_client", "Invalid client_assertion JWT", 401);
    }
    if (bodyClientId && bodyClientId !== assertionClientId) {
      throw new OAuthTokenError(
        "invalid_client",
        "client_id does not match client_assertion subject",
        401
      );
    }
  }

  const effectiveClientId = assertionClientId || bodyClientId || params.fallbackClientId?.trim() || "";
  const client = await resolveOAuthClient(effectiveClientId, params.cimdDeps);

  if (clientAssertion || clientAssertionType) {
    try {
      await verifyPrivateKeyJwtAssertion({
        client,
        clientAssertionType: clientAssertionType || null,
        clientAssertion: clientAssertion || null,
        expectedAudiences: [`${params.canonicalOrigin}/oauth/token`, params.canonicalOrigin],
        deps: params.cimdDeps,
      });
    } catch (err) {
      const message =
        err instanceof ClientAssertionError ? err.message : "Invalid client_assertion";
      throw new OAuthTokenError("invalid_client", message, 401);
    }
  } else if (!client.allowedAuthMethods.includes("none")) {
    throw new OAuthTokenError(
      "invalid_client",
      "Client authentication via private_key_jwt is required",
      401
    );
  }

  return effectiveClientId;
}

/** Normalizes and validates an RFC 8707 `resource` indicator against the canonical server origin. */
export function validateResourceIndicator(
  resource: string | null | undefined,
  canonicalOrigin: string
): { ok: true; resource: string | null } | { ok: false; error: string } {
  if (!resource || !resource.trim()) {
    return { ok: true, resource: null };
  }

  try {
    const parsed = new URL(resource.trim());
    const originParsed = new URL(canonicalOrigin);
    if (parsed.origin !== originParsed.origin) {
      return { ok: false, error: "resource origin mismatch" };
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    if (cleanPath !== "" && cleanPath !== "/mcp") {
      return { ok: false, error: "invalid resource path" };
    }
    return { ok: true, resource: `${originParsed.origin}/mcp` };
  } catch {
    return { ok: false, error: "malformed resource URI" };
  }
}

export interface CreateAuthCodeInput {
  clientId: string;
  userId: number;
  redirectUri: string;
  scopes: string[];
  resource: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
}

/** Issues a single-use 5-minute PKCE S256 authorization code (stored as SHA-256 digest). */
export async function createAuthorizationCode(input: CreateAuthCodeInput): Promise<string> {
  const code = generateOpaqueToken("recomp_ac_");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + AUTH_CODE_TTL_MS);

  await db.insert(mcpOauthAuthCodes).values({
    codeHash: sha256Hex(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    scope: input.scopes.join(" "),
    resource: input.resource,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    expiresAt,
    consumedAt: null,
    createdAt: now,
  });

  return code;
}

export interface IssuedTokenPair {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokenPair(params: {
  grantId: string;
  userId: number;
  clientId: string;
  familyId: string;
  scope: string;
  resource: string | null;
}): Promise<IssuedTokenPair> {
  const now = new Date();
  const accessTtlSec = getAccessTokenTtlSeconds();
  const refreshTtlDays = getRefreshTokenTtlDays();

  const accessToken = generateOpaqueToken(ACCESS_TOKEN_PREFIX);
  const refreshToken = generateOpaqueToken(REFRESH_TOKEN_PREFIX);

  const accessExpiresAt = new Date(now.getTime() + accessTtlSec * 1000);
  const refreshExpiresAt = new Date(now.getTime() + refreshTtlDays * 24 * 60 * 60 * 1000);

  await db.insert(mcpOauthTokens).values([
    {
      grantId: params.grantId,
      userId: params.userId,
      clientId: params.clientId,
      tokenType: "access",
      tokenHash: sha256Hex(accessToken),
      familyId: params.familyId,
      scope: params.scope,
      resource: params.resource,
      expiresAt: accessExpiresAt,
      rotatedAt: null,
      revokedAt: null,
      createdAt: now,
    },
    {
      grantId: params.grantId,
      userId: params.userId,
      clientId: params.clientId,
      tokenType: "refresh",
      tokenHash: sha256Hex(refreshToken),
      familyId: params.familyId,
      scope: params.scope,
      resource: params.resource,
      expiresAt: refreshExpiresAt,
      rotatedAt: null,
      revokedAt: null,
      createdAt: now,
    },
  ]);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: accessTtlSec,
    refresh_token: refreshToken,
    scope: params.scope,
  };
}

export interface ExchangeAuthCodeInput {
  code: string;
  clientId?: string | null;
  redirectUri: string;
  codeVerifier: string;
  resource?: string | null;
  clientAssertionType?: string | null;
  clientAssertion?: string | null;
  canonicalOrigin: string;
  cimdDeps?: CimdDependencies;
}

/** Exchanges a PKCE S256 authorization code for an access + rotating refresh token pair. */
export async function exchangeAuthorizationCode(
  input: ExchangeAuthCodeInput
): Promise<IssuedTokenPair> {
  if (!input.code || (!input.clientId && !input.clientAssertion) || !input.redirectUri || !input.codeVerifier) {
    throw new OAuthTokenError("invalid_request", "Missing required token exchange parameters");
  }

  const effectiveClientId = await authenticateTokenEndpointClient({
    bodyClientId: input.clientId,
    clientAssertionType: input.clientAssertionType,
    clientAssertion: input.clientAssertion,
    canonicalOrigin: input.canonicalOrigin,
    cimdDeps: input.cimdDeps,
  });

  const codeHash = sha256Hex(input.code);
  const authCode = await db.query.mcpOauthAuthCodes.findFirst({
    where: eq(mcpOauthAuthCodes.codeHash, codeHash),
  });

  if (!authCode) {
    throw new OAuthTokenError("invalid_grant", "Invalid authorization code");
  }

  if (authCode.consumedAt) {
    throw new OAuthTokenError("invalid_grant", "Authorization code has already been used");
  }

  const now = new Date();
  if (authCode.expiresAt <= now) {
    throw new OAuthTokenError("invalid_grant", "Authorization code has expired");
  }

  if (authCode.clientId !== effectiveClientId) {
    throw new OAuthTokenError("invalid_grant", "client_id mismatch");
  }

  if (authCode.redirectUri !== input.redirectUri) {
    throw new OAuthTokenError("invalid_grant", "redirect_uri mismatch");
  }

  if (authCode.codeChallengeMethod !== "S256") {
    throw new OAuthTokenError("invalid_grant", "Unsupported code_challenge_method");
  }

  if (!verifyPkceS256(input.codeVerifier, authCode.codeChallenge)) {
    throw new OAuthTokenError("invalid_grant", "PKCE verification failed");
  }

  const resCheck = validateResourceIndicator(input.resource, input.canonicalOrigin);
  if (!resCheck.ok) {
    throw new OAuthTokenError("invalid_target", resCheck.error);
  }
  if (authCode.resource && resCheck.resource && authCode.resource !== resCheck.resource) {
    throw new OAuthTokenError("invalid_target", "resource mismatch");
  }

  // Mark code consumed
  const [consumed] = await db
    .update(mcpOauthAuthCodes)
    .set({ consumedAt: now })
    .where(and(eq(mcpOauthAuthCodes.id, authCode.id), isNull(mcpOauthAuthCodes.consumedAt)))
    .returning();

  if (!consumed) {
    throw new OAuthTokenError("invalid_grant", "Authorization code already consumed");
  }

  // Upsert user <-> client grant
  const existingGrant = await db.query.mcpOauthGrants.findFirst({
    where: and(
      eq(mcpOauthGrants.userId, authCode.userId),
      eq(mcpOauthGrants.clientId, authCode.clientId)
    ),
  });

  let grantId: string;
  if (existingGrant) {
    grantId = existingGrant.id;
    await db
      .update(mcpOauthGrants)
      .set({
        grantedScopes: authCode.scope,
        revokedAt: null,
        lastUsedAt: now,
        updatedAt: now,
      })
      .where(eq(mcpOauthGrants.id, grantId));
  } else {
    grantId = crypto.randomUUID();
    await db.insert(mcpOauthGrants).values({
      id: grantId,
      userId: authCode.userId,
      clientId: authCode.clientId,
      grantedScopes: authCode.scope,
      lastUsedAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db
    .update(mcpOauthClients)
    .set({ lastUsedAt: now })
    .where(eq(mcpOauthClients.clientId, authCode.clientId));

  const effectiveResource = authCode.resource ?? resCheck.resource;
  return issueTokenPair({
    grantId,
    userId: authCode.userId,
    clientId: authCode.clientId,
    familyId: crypto.randomUUID(),
    scope: authCode.scope,
    resource: effectiveResource,
  });
}

export interface RotateRefreshTokenInput {
  refreshToken: string;
  clientId?: string | null;
  scope?: string | null;
  resource?: string | null;
  clientAssertionType?: string | null;
  clientAssertion?: string | null;
  canonicalOrigin: string;
  cimdDeps?: CimdDependencies;
}

/**
 * Rotates a refresh token and revokes the entire token family + grant on reuse detection.
 */
export async function rotateRefreshToken(
  input: RotateRefreshTokenInput
): Promise<IssuedTokenPair> {
  if (!input.refreshToken) {
    throw new OAuthTokenError("invalid_request", "Missing refresh_token");
  }

  const tokenHash = sha256Hex(input.refreshToken);
  const existing = await db.query.mcpOauthTokens.findFirst({
    where: and(
      eq(mcpOauthTokens.tokenHash, tokenHash),
      eq(mcpOauthTokens.tokenType, "refresh")
    ),
  });

  if (!existing) {
    throw new OAuthTokenError("invalid_grant", "Invalid refresh token");
  }

  const now = new Date();

  // Refresh token reuse detection: revoke the whole family and parent grant immediately.
  if (existing.rotatedAt !== null || existing.revokedAt !== null) {
    await db
      .update(mcpOauthTokens)
      .set({ revokedAt: now })
      .where(and(eq(mcpOauthTokens.familyId, existing.familyId), isNull(mcpOauthTokens.revokedAt)));

    await db
      .update(mcpOauthGrants)
      .set({ revokedAt: now, updatedAt: now })
      .where(eq(mcpOauthGrants.id, existing.grantId));

    throw new OAuthTokenError(
      "invalid_grant",
      "Refresh token reuse detected; token family revoked"
    );
  }

  if (existing.expiresAt <= now) {
    throw new OAuthTokenError("invalid_grant", "Refresh token has expired");
  }

  const effectiveClientId = await authenticateTokenEndpointClient({
    bodyClientId: input.clientId,
    fallbackClientId: existing.clientId,
    clientAssertionType: input.clientAssertionType,
    clientAssertion: input.clientAssertion,
    canonicalOrigin: input.canonicalOrigin,
    cimdDeps: input.cimdDeps,
  });

  if (existing.clientId !== effectiveClientId) {
    throw new OAuthTokenError("invalid_grant", "client_id mismatch");
  }

  const grant = await db.query.mcpOauthGrants.findFirst({
    where: eq(mcpOauthGrants.id, existing.grantId),
  });

  if (!grant || grant.revokedAt !== null) {
    throw new OAuthTokenError("invalid_grant", "Authorization grant has been revoked");
  }

  const resCheck = validateResourceIndicator(input.resource, input.canonicalOrigin);
  if (!resCheck.ok) {
    throw new OAuthTokenError("invalid_target", resCheck.error);
  }

  const grantedScopes = parseRequestedScopes(existing.scope);
  let nextScopes = grantedScopes;
  if (input.scope && input.scope.trim()) {
    const requested = parseRequestedScopes(input.scope);
    const hasEscalation = requested.some((s) => !grantedScopes.includes(s));
    if (hasEscalation) {
      throw new OAuthTokenError("invalid_scope", "Requested scope exceeds original grant");
    }
    nextScopes = requested;
  }

  // Mark current refresh token rotated (atomic single-use check)
  const [marked] = await db
    .update(mcpOauthTokens)
    .set({ rotatedAt: now })
    .where(and(eq(mcpOauthTokens.id, existing.id), isNull(mcpOauthTokens.rotatedAt)))
    .returning();

  if (!marked) {
    await db
      .update(mcpOauthTokens)
      .set({ revokedAt: now })
      .where(and(eq(mcpOauthTokens.familyId, existing.familyId), isNull(mcpOauthTokens.revokedAt)));
    await db
      .update(mcpOauthGrants)
      .set({ revokedAt: now, updatedAt: now })
      .where(eq(mcpOauthGrants.id, existing.grantId));
    throw new OAuthTokenError("invalid_grant", "Concurrent refresh token reuse detected");
  }

  await db
    .update(mcpOauthGrants)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(mcpOauthGrants.id, existing.grantId));

  return issueTokenPair({
    grantId: existing.grantId,
    userId: existing.userId,
    clientId: existing.clientId,
    familyId: existing.familyId,
    scope: nextScopes.join(" "),
    resource: existing.resource ?? resCheck.resource,
  });
}

/** Revokes an OAuth access or refresh token (and its family when a refresh token is passed). */
export async function revokeOAuthToken(token: string): Promise<void> {
  if (!token) return;
  const tokenHash = sha256Hex(token);
  const existing = await db.query.mcpOauthTokens.findFirst({
    where: eq(mcpOauthTokens.tokenHash, tokenHash),
  });

  if (!existing) return;

  const now = new Date();
  if (existing.tokenType === "refresh") {
    await db
      .update(mcpOauthTokens)
      .set({ revokedAt: now })
      .where(and(eq(mcpOauthTokens.familyId, existing.familyId), isNull(mcpOauthTokens.revokedAt)));
  } else {
    await db
      .update(mcpOauthTokens)
      .set({ revokedAt: now })
      .where(eq(mcpOauthTokens.id, existing.id));
  }
}

export interface CreatedPersonalAccessToken {
  id: string;
  name: string;
  token: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

/** Creates a scoped Personal Access Token stored strictly as a SHA-256 hash. */
export async function createPersonalAccessToken(params: {
  userId: number;
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
}): Promise<CreatedPersonalAccessToken> {
  const token = generateOpaqueToken(PAT_TOKEN_PREFIX);
  const tokenPrefix = token.slice(0, 15);
  const id = crypto.randomUUID();
  const createdAt = new Date();

  await db.insert(mcpPersonalAccessTokens).values({
    id,
    userId: params.userId,
    name: params.name.trim(),
    tokenPrefix,
    tokenHash: sha256Hex(token),
    scopes: params.scopes.join(" "),
    lastUsedAt: null,
    expiresAt: params.expiresAt ?? null,
    revokedAt: null,
    createdAt,
  });

  return {
    id,
    name: params.name.trim(),
    token,
    tokenPrefix,
    scopes: params.scopes,
    expiresAt: params.expiresAt ?? null,
    createdAt,
  };
}

/** Revokes a user-owned Personal Access Token. */
export async function revokePersonalAccessToken(id: string, userId: number): Promise<boolean> {
  const now = new Date();
  const updated = await db
    .update(mcpPersonalAccessTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(mcpPersonalAccessTokens.id, id),
        eq(mcpPersonalAccessTokens.userId, userId),
        isNull(mcpPersonalAccessTokens.revokedAt)
      )
    )
    .returning();

  return updated.length > 0;
}
