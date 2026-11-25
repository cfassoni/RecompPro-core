import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import { getCanonicalOrigin } from "@/lib/mcp/config";
import {
  MCP_CORS_HEADERS,
  handleMcpOptions,
  mcpDisabledResponse,
} from "@/lib/mcp/cors";
import {
  OAuthTokenError,
  createAuthorizationCode,
  resolveOAuthClient,
  validateResourceIndicator,
} from "@/lib/mcp/oauth/tokens";
import { stripWriteScopes, validateRequestedScopes } from "@/lib/mcp/scopes";

interface AuthorizeDecisionBody {
  approved?: boolean;
  readOnly?: boolean;
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
  resource?: string;
}

export const POST = withAuth(async (req, { user }) => {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  let body: AuthorizeDecisionBody;
  try {
    body = (await req.json()) as AuthorizeDecisionBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Malformed JSON body" },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  const clientId = body.client_id || "";
  const redirectUri = body.redirect_uri || "";
  const responseType = body.response_type || "";
  const codeChallenge = body.code_challenge || "";
  const codeChallengeMethod = body.code_challenge_method || "";

  if (responseType !== "code") {
    return NextResponse.json(
      { error: "unsupported_response_type", error_description: "response_type must be 'code'" },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "PKCE code_challenge (S256) is required" },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  let client;
  try {
    client = await resolveOAuthClient(clientId);
  } catch (err) {
    const message = err instanceof OAuthTokenError ? err.message : "Invalid client_id";
    return NextResponse.json(
      { error: "invalid_client", error_description: message },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "Unregistered redirect_uri" },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  const scopeCheck = validateRequestedScopes(body.scope);
  if (!scopeCheck.ok) {
    return NextResponse.json(
      { error: "invalid_scope", error_description: `Unsupported scope(s): ${scopeCheck.unknown.join(", ")}` },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  const resourceCheck = validateResourceIndicator(body.resource, getCanonicalOrigin(req));
  if (!resourceCheck.ok) {
    return NextResponse.json(
      { error: "invalid_target", error_description: resourceCheck.error },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  const redirectTarget = new URL(redirectUri);
  if (body.state) {
    redirectTarget.searchParams.set("state", body.state);
  }

  if (!body.approved) {
    redirectTarget.searchParams.set("error", "access_denied");
    redirectTarget.searchParams.set("error_description", "User denied authorization request");
    return NextResponse.json(
      { redirectUrl: redirectTarget.toString() },
      { status: 200, headers: MCP_CORS_HEADERS }
    );
  }

  const grantedScopes = body.readOnly
    ? stripWriteScopes(scopeCheck.scopes)
    : scopeCheck.scopes;

  const code = await createAuthorizationCode({
    clientId: client.clientId,
    userId: user.id,
    redirectUri,
    scopes: grantedScopes,
    resource: resourceCheck.resource,
    codeChallenge,
    codeChallengeMethod: "S256",
  });

  redirectTarget.searchParams.set("code", code);

  return NextResponse.json(
    { redirectUrl: redirectTarget.toString() },
    { status: 200, headers: MCP_CORS_HEADERS }
  );
});

export async function OPTIONS() {
  return handleMcpOptions();
}
