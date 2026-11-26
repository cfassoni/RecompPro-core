import { db } from "@/db/client";
import {
  mcpAuditLogs,
  mcpOauthAuthCodes,
  mcpOauthClients,
  mcpOauthGrants,
  mcpOauthTokens,
} from "@/db/schema";
import { and, desc, eq, inArray, lt, notInArray } from "drizzle-orm";
import { getAuditLogMaxPerUser, getAuditLogRetentionDays } from "@/lib/mcp/config";

export interface McpAuditLogInput {
  userId: number;
  authMethod: "oauth" | "pat";
  clientLabel: string;
  primitiveType: "tool" | "resource" | "prompt";
  primitiveName: string;
  accessMode: "read" | "write";
  status: "success" | "denied" | "error";
  errorCode?: string | null;
  durationMs: number;
}

/**
 * Normalizes an error code to uppercase `[A-Z0-9_]` capped at 64 chars.
 * Never persists raw exception messages, stack traces, PII, or secrets.
 */
export function sanitizeErrorCode(code?: string | null): string | null {
  if (!code) return null;
  const normalized = code
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || null;
}

/**
 * Enforces both age-based retention and per-user row cap on `mcp_audit_logs`.
 */
export async function pruneMcpAuditLogsForUser(
  userId: number,
  now: Date = new Date()
): Promise<{ deletedByAge: number; deletedByCap: number }> {
  const retentionDays = getAuditLogRetentionDays();
  const maxPerUser = getAuditLogMaxPerUser();
  const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  const agedOut = await db
    .delete(mcpAuditLogs)
    .where(and(eq(mcpAuditLogs.userId, userId), lt(mcpAuditLogs.createdAt, cutoffDate)))
    .returning({ id: mcpAuditLogs.id });

  const remaining = await db
    .select({ id: mcpAuditLogs.id })
    .from(mcpAuditLogs)
    .where(eq(mcpAuditLogs.userId, userId))
    .orderBy(desc(mcpAuditLogs.createdAt), desc(mcpAuditLogs.id));

  let deletedByCap = 0;
  if (remaining.length > maxPerUser) {
    const excessIds = remaining.slice(maxPerUser).map((r) => r.id);
    if (excessIds.length > 0) {
      const deleted = await db
        .delete(mcpAuditLogs)
        .where(and(eq(mcpAuditLogs.userId, userId), inArray(mcpAuditLogs.id, excessIds)))
        .returning({ id: mcpAuditLogs.id });
      deletedByCap = deleted.length;
    }
  }

  return {
    deletedByAge: agedOut.length,
    deletedByCap,
  };
}

/**
 * Records a sanitized MCP primitive invocation audit row and applies retention pruning.
 */
export async function recordMcpAuditLog(entry: McpAuditLogInput): Promise<void> {
  try {
    await db.insert(mcpAuditLogs).values({
      userId: entry.userId,
      authMethod: entry.authMethod,
      clientLabel: entry.clientLabel.slice(0, 120),
      primitiveType: entry.primitiveType,
      primitiveName: entry.primitiveName.slice(0, 200),
      accessMode: entry.accessMode,
      status: entry.status,
      errorCode: sanitizeErrorCode(entry.errorCode),
      durationMs: Math.max(0, Math.round(entry.durationMs)),
      createdAt: new Date(),
    });

    await pruneMcpAuditLogsForUser(entry.userId);
  } catch (err) {
    console.error("Failed to record MCP audit log:", err);
  }
}

/**
 * Cleans up expired OAuth authorization codes, expired tokens, and stale ungranted DCR clients (>30 days).
 */
export async function pruneExpiredOauthArtifacts(
  now: Date = new Date()
): Promise<{
  deletedAuthCodes: number;
  deletedTokens: number;
  deletedStaleDcrClients: number;
}> {
  const deletedCodes = await db
    .delete(mcpOauthAuthCodes)
    .where(lt(mcpOauthAuthCodes.expiresAt, now))
    .returning({ id: mcpOauthAuthCodes.id });

  const deletedTokens = await db
    .delete(mcpOauthTokens)
    .where(lt(mcpOauthTokens.expiresAt, now))
    .returning({ id: mcpOauthTokens.id });

  const dcrCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const deletedDcr = await db
    .delete(mcpOauthClients)
    .where(
      and(
        eq(mcpOauthClients.registrationType, "dcr"),
        lt(mcpOauthClients.createdAt, dcrCutoff),
        notInArray(
          mcpOauthClients.clientId,
          db.select({ clientId: mcpOauthGrants.clientId }).from(mcpOauthGrants)
        )
      )
    )
    .returning({ id: mcpOauthClients.id });

  return {
    deletedAuthCodes: deletedCodes.length,
    deletedTokens: deletedTokens.length,
    deletedStaleDcrClients: deletedDcr.length,
  };
}
