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
  resolveOAuthClient,
  validateResourceIndicator,
} from "@/lib/mcp/oauth/tokens";
import { isReadOnlyScopes, validateRequestedScopes } from "@/lib/mcp/scopes";

export async function GET(req: NextRequest) {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  const sp = req.nextUrl.searchParams;
  const responseType = sp.get("response_type");
  const clientId = sp.get("client_id") || "";
  const redirectUri = sp.get("redirect_uri") || "";
  const codeChallenge = sp.get("code_challenge") || "";
  const codeChallengeMethod = sp.get("code_challenge_method") || "";
  const scopeRaw = sp.get("scope");
  const resource = sp.get("resource");

  if (responseType !== "code") {
    return NextResponse.json(
      { valid: false, error: "unsupported_response_type", error_description: "response_type must be 'code'" },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return NextResponse.json(
      { valid: false, error: "invalid_request", error_description: "PKCE code_challenge with method S256 is required" },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  let client;
  try {
    client = await resolveOAuthClient(clientId);
  } catch (err) {
    const message = err instanceof OAuthTokenError ? err.message : "Invalid client_id";
    return NextResponse.json(
      { valid: false, error: "invalid_client", error_description: message },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return NextResponse.json(
      { valid: false, error: "invalid_redirect_uri", error_description: "redirect_uri is not registered for this client" },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  const scopeCheck = validateRequestedScopes(scopeRaw);
  if (!scopeCheck.ok) {
    return NextResponse.json(
      {
        valid: false,
        error: "invalid_scope",
        error_description: `Unsupported scope(s): ${scopeCheck.unknown.join(", ")}`,
      },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  const resourceCheck = validateResourceIndicator(resource, getCanonicalOrigin(req));
  if (!resourceCheck.ok) {
    return NextResponse.json(
      { valid: false, error: "invalid_target", error_description: resourceCheck.error },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  return NextResponse.json(
    {
      valid: true,
      client: {
        clientId: client.clientId,
        clientName: client.clientName,
        registrationType: client.registrationType,
        clientUri: client.clientUri,
        logoUri: client.logoUri,
      },
      scopes: scopeCheck.scopes,
      hasWriteScopes: !isReadOnlyScopes(scopeCheck.scopes),
      resource: resourceCheck.resource,
    },
    { status: 200, headers: MCP_CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return handleMcpOptions();
}
