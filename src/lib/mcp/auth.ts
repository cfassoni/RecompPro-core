import { db } from "@/db/client";
import {
  mcpOauthClients,
  mcpOauthGrants,
  mcpOauthTokens,
  mcpPersonalAccessTokens,
  users,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { extractTokenFromHeader } from "@/lib/auth";
import { getCanonicalOrigin, getMcpResourceUrl } from "@/lib/mcp/config";
import { parseRequestedScopes } from "@/lib/mcp/scopes";
import {
  ACCESS_TOKEN_PREFIX,
  PAT_TOKEN_PREFIX,
  sha256Hex,
} from "./oauth/tokens";

export interface McpAuthContext {
  userId: number;
  userEmail: string;
  authMethod: "oauth" | "pat";
  clientLabel: string;
  clientId?: string;
  grantId?: string;
  patId?: string;
  scopes: string[];
}

/**
 * Authenticates an MCP HTTP request strictly via `Authorization: Bearer <token>`.
 * Query parameters (`?token=`, `?api_key=`) are intentionally ignored per security policy.
 */
export async function authenticateMcpRequest(req: Request): Promise<McpAuthContext | null> {
  const token = extractTokenFromHeader(req.headers.get("authorization"));
  if (!token) {
    return null;
  }

  const now = new Date();
  const tokenHash = sha256Hex(token);

  if (token.startsWith(PAT_TOKEN_PREFIX)) {
    const pat = await db.query.mcpPersonalAccessTokens.findFirst({
      where: eq(mcpPersonalAccessTokens.tokenHash, tokenHash),
    });

    if (!pat || pat.revokedAt !== null) {
      return null;
    }

    if (pat.expiresAt && pat.expiresAt <= now) {
      return null;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, pat.userId),
    });

    if (!user || !user.emailConfirmed) {
      return null;
    }

    await db
      .update(mcpPersonalAccessTokens)
      .set({ lastUsedAt: now })
      .where(eq(mcpPersonalAccessTokens.id, pat.id));

    return {
      userId: user.id,
      userEmail: user.email,
      authMethod: "pat",
      clientLabel: pat.name,
      patId: pat.id,
      scopes: parseRequestedScopes(pat.scopes),
    };
  }

  if (token.startsWith(ACCESS_TOKEN_PREFIX)) {
    const tokenRow = await db.query.mcpOauthTokens.findFirst({
      where: and(
        eq(mcpOauthTokens.tokenHash, tokenHash),
        eq(mcpOauthTokens.tokenType, "access")
      ),
    });

    if (!tokenRow || tokenRow.revokedAt !== null || tokenRow.expiresAt <= now) {
      return null;
    }

    if (tokenRow.resource) {
      const expectedResource = getMcpResourceUrl(req);
      const expectedOrigin = getCanonicalOrigin(req);
      const cleanTokenRes = tokenRow.resource.replace(/\/+$/, "");
      if (cleanTokenRes !== expectedResource && cleanTokenRes !== expectedOrigin) {
        return null;
      }
    }

    const grant = await db.query.mcpOauthGrants.findFirst({
      where: eq(mcpOauthGrants.id, tokenRow.grantId),
    });

    if (!grant || grant.revokedAt !== null) {
      return null;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, tokenRow.userId),
    });

    if (!user || !user.emailConfirmed) {
      return null;
    }

    const client = await db.query.mcpOauthClients.findFirst({
      where: eq(mcpOauthClients.clientId, tokenRow.clientId),
    });

    await db
      .update(mcpOauthGrants)
      .set({ lastUsedAt: now })
      .where(eq(mcpOauthGrants.id, grant.id));

    return {
      userId: user.id,
      userEmail: user.email,
      authMethod: "oauth",
      clientLabel: client?.clientName ?? tokenRow.clientId,
      clientId: tokenRow.clientId,
      grantId: grant.id,
      scopes: parseRequestedScopes(tokenRow.scope),
    };
  }

  return null;
}

/** Builds an RFC 9728 `WWW-Authenticate` Bearer challenge header. */
export function buildWwwAuthenticateHeader(req: Request, scope = "recomp:read"): string {
  const origin = getCanonicalOrigin(req);
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${scope}"`;
}
