import { NextRequest, NextResponse } from "next/server";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import {
  MCP_CORS_HEADERS,
  handleMcpOptions,
  mcpDisabledResponse,
} from "@/lib/mcp/cors";
import { revokeOAuthToken } from "@/lib/mcp/oauth/tokens";

export async function POST(req: NextRequest) {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    const raw = await req.text();
    let token = "";

    if (contentType.includes("application/json")) {
      const parsed = JSON.parse(raw || "{}") as { token?: unknown };
      if (typeof parsed.token === "string") token = parsed.token;
    } else {
      const params = new URLSearchParams(raw);
      token = params.get("token") || "";
    }

    if (token) {
      await revokeOAuthToken(token);
    }

    // RFC 7009 returns 200 OK even if token was already invalid or unknown
    return new NextResponse(null, {
      status: 200,
      headers: {
        ...MCP_CORS_HEADERS,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("OAuth revoke error:", err);
    return NextResponse.json(
      { error: "invalid_request", error_description: "Malformed revocation request" },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return handleMcpOptions();
}
