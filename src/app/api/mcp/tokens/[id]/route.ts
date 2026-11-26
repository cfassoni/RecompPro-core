import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import { mcpDisabledResponse } from "@/lib/mcp/cors";
import { revokePersonalAccessToken } from "@/lib/mcp/oauth/tokens";

export const DELETE = withAuth(async (_req, { user, params }) => {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  try {
    const tokenId = String(params?.id || "").trim();
    if (!tokenId) {
      return NextResponse.json({ detail: "Invalid token ID" }, { status: 400 });
    }

    const revoked = await revokePersonalAccessToken(tokenId, user.id);
    if (!revoked) {
      return NextResponse.json(
        { detail: "Personal access token not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, id: tokenId });
  } catch (err) {
    console.error("Failed to revoke MCP PAT:", err);
    return NextResponse.json(
      { detail: "Failed to revoke personal access token" },
      { status: 500 }
    );
  }
});
