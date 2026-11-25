import { NextRequest, NextResponse } from "next/server";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import { getCanonicalOrigin } from "@/lib/mcp/config";
import {
  MCP_CORS_HEADERS,
  handleMcpOptions,
  mcpDisabledResponse,
} from "@/lib/mcp/cors";
import {
  OAuthTokenError,
  exchangeAuthorizationCode,
  rotateRefreshToken,
} from "@/lib/mcp/oauth/tokens";

const TOKEN_HEADERS: Record<string, string> = {
  ...MCP_CORS_HEADERS,
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

async function parseTokenBody(req: NextRequest): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") || "";
  const raw = await req.text();

  if (contentType.includes("application/json")) {
    const json = JSON.parse(raw || "{}") as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(json)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }

  const params = new URLSearchParams(raw);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  let body: Record<string, string>;
  try {
    body = await parseTokenBody(req);
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Malformed request body" },
      { status: 400, headers: TOKEN_HEADERS }
    );
  }

  const grantType = body.grant_type;
  const canonicalOrigin = getCanonicalOrigin(req);

  try {
    if (grantType === "authorization_code") {
      const tokens = await exchangeAuthorizationCode({
        code: body.code || "",
        clientId: body.client_id || "",
        redirectUri: body.redirect_uri || "",
        codeVerifier: body.code_verifier || "",
        resource: body.resource || null,
        canonicalOrigin,
      });
      return NextResponse.json(tokens, { status: 200, headers: TOKEN_HEADERS });
    }

    if (grantType === "refresh_token") {
      const tokens = await rotateRefreshToken({
        refreshToken: body.refresh_token || "",
        clientId: body.client_id || null,
        scope: body.scope || null,
        resource: body.resource || null,
        canonicalOrigin,
      });
      return NextResponse.json(tokens, { status: 200, headers: TOKEN_HEADERS });
    }

    return NextResponse.json(
      { error: "unsupported_grant_type", error_description: "Supported grants: authorization_code, refresh_token" },
      { status: 400, headers: TOKEN_HEADERS }
    );
  } catch (err) {
    if (err instanceof OAuthTokenError) {
      return NextResponse.json(
        { error: err.code, error_description: err.message },
        { status: err.status, headers: TOKEN_HEADERS }
      );
    }
    console.error("OAuth token error:", err);
    return NextResponse.json(
      { error: "server_error", error_description: "Failed to process token request" },
      { status: 500, headers: TOKEN_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return handleMcpOptions();
}
