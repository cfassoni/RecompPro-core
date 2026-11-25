import { NextRequest, NextResponse } from "next/server";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import { getCanonicalOrigin } from "@/lib/mcp/config";
import {
  MCP_CORS_HEADERS,
  handleMcpOptions,
  mcpDisabledResponse,
} from "@/lib/mcp/cors";
import { SUPPORTED_SCOPES } from "@/lib/mcp/scopes";

export async function GET(req: NextRequest) {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  const origin = getCanonicalOrigin(req);

  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      scopes_supported: [...SUPPORTED_SCOPES],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
      revocation_endpoint_auth_methods_supported: ["none"],
    },
    {
      status: 200,
      headers: {
        ...MCP_CORS_HEADERS,
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}

export async function OPTIONS() {
  return handleMcpOptions();
}
