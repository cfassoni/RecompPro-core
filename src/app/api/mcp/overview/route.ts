import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import {
  mcpAuditLogs,
  mcpOauthGrants,
  mcpPersonalAccessTokens,
} from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import { getMcpResourceUrl } from "@/lib/mcp/config";
import { mcpDisabledResponse } from "@/lib/mcp/cors";
import { isReadOnlyScopes, parseRequestedScopes } from "@/lib/mcp/scopes";

export const GET = withAuth(async (req, { user }) => {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  try {
    const now = new Date();
    const endpointUrl = getMcpResourceUrl(req);

    const [grantRows, patRows, logRows] = await Promise.all([
      db.query.mcpOauthGrants.findMany({
        where: and(
          eq(mcpOauthGrants.userId, user.id),
          isNull(mcpOauthGrants.revokedAt)
        ),
        orderBy: [desc(mcpOauthGrants.createdAt)],
        with: {
          client: true,
        },
      }),
      db.query.mcpPersonalAccessTokens.findMany({
        where: and(
          eq(mcpPersonalAccessTokens.userId, user.id),
          isNull(mcpPersonalAccessTokens.revokedAt)
        ),
        orderBy: [desc(mcpPersonalAccessTokens.createdAt)],
      }),
      db.query.mcpAuditLogs.findMany({
        where: eq(mcpAuditLogs.userId, user.id),
        orderBy: [desc(mcpAuditLogs.createdAt), desc(mcpAuditLogs.id)],
        limit: 100,
      }),
    ]);

    const grants = grantRows.map((g) => {
      const scopes = parseRequestedScopes(g.grantedScopes);
      return {
        id: g.id,
        clientId: g.clientId,
        clientName: g.client?.clientName ?? g.clientId,
        clientUri: g.client?.clientUri ?? null,
        registrationType: (g.client?.registrationType === "cimd" ? "cimd" : "dcr") as
          | "cimd"
          | "dcr",
        scopes,
        readOnly: isReadOnlyScopes(scopes),
        lastUsedAt: g.lastUsedAt ? g.lastUsedAt.toISOString() : null,
        createdAt: g.createdAt.toISOString(),
      };
    });

    const tokens = patRows.map((p) => {
      const scopes = parseRequestedScopes(p.scopes);
      return {
        id: p.id,
        name: p.name,
        tokenPrefix: p.tokenPrefix,
        scopes,
        readOnly: isReadOnlyScopes(scopes),
        lastUsedAt: p.lastUsedAt ? p.lastUsedAt.toISOString() : null,
        expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
        isExpired: Boolean(p.expiresAt && p.expiresAt <= now),
        createdAt: p.createdAt.toISOString(),
      };
    });

    const auditLogs = logRows.map((l) => ({
      id: l.id,
      authMethod: l.authMethod as "oauth" | "pat",
      clientLabel: l.clientLabel,
      primitiveType: l.primitiveType as "tool" | "resource" | "prompt",
      primitiveName: l.primitiveName,
      accessMode: l.accessMode as "read" | "write",
      status: l.status as "success" | "denied" | "error",
      errorCode: l.errorCode,
      durationMs: l.durationMs,
      createdAt: l.createdAt.toISOString(),
    }));

    return NextResponse.json({
      endpointUrl,
      grants,
      tokens,
      auditLogs,
    });
  } catch (err) {
    console.error("Failed to fetch MCP overview:", err);
    return NextResponse.json(
      { detail: "Failed to load MCP overview" },
      { status: 500 }
    );
  }
});
