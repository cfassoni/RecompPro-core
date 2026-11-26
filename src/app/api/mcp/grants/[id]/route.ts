import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { mcpOauthGrants, mcpOauthTokens } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import { mcpDisabledResponse } from "@/lib/mcp/cors";

export const DELETE = withAuth(async (_req, { user, params }) => {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  try {
    const grantId = String(params?.id || "").trim();
    if (!grantId) {
      return NextResponse.json({ detail: "Invalid grant ID" }, { status: 400 });
    }

    const grant = await db.query.mcpOauthGrants.findFirst({
      where: and(
        eq(mcpOauthGrants.id, grantId),
        eq(mcpOauthGrants.userId, user.id),
        isNull(mcpOauthGrants.revokedAt)
      ),
    });

    if (!grant) {
      return NextResponse.json({ detail: "OAuth grant not found" }, { status: 404 });
    }

    const now = new Date();
    await db
      .update(mcpOauthGrants)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(mcpOauthGrants.id, grantId), eq(mcpOauthGrants.userId, user.id)));

    await db
      .update(mcpOauthTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(mcpOauthTokens.grantId, grantId),
          eq(mcpOauthTokens.userId, user.id),
          isNull(mcpOauthTokens.revokedAt)
        )
      );

    return NextResponse.json({ success: true, id: grantId });
  } catch (err) {
    console.error("Failed to revoke MCP OAuth grant:", err);
    return NextResponse.json(
      { detail: "Failed to revoke OAuth grant" },
      { status: 500 }
    );
  }
});
