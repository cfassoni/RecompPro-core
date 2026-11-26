import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { mcpAuditLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import { mcpDisabledResponse } from "@/lib/mcp/cors";

export const GET = withAuth(async (req, { user }) => {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  try {
    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") || "100");
    const limit = Number.isFinite(rawLimit)
      ? Math.min(200, Math.max(1, Math.floor(rawLimit)))
      : 100;

    const rows = await db.query.mcpAuditLogs.findMany({
      where: eq(mcpAuditLogs.userId, user.id),
      orderBy: [desc(mcpAuditLogs.createdAt), desc(mcpAuditLogs.id)],
      limit,
    });

    const logs = rows.map((l) => ({
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

    return NextResponse.json({ logs });
  } catch (err) {
    console.error("Failed to fetch MCP audit logs:", err);
    return NextResponse.json(
      { detail: "Failed to fetch MCP audit logs" },
      { status: 500 }
    );
  }
});
