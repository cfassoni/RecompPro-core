import { NextRequest, NextResponse } from "next/server";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import { getCanonicalOrigin, getMcpResourceUrl } from "@/lib/mcp/config";
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
  const resource = getMcpResourceUrl(req);

  return NextResponse.json(
    {
      resource,
      authorization_servers: [origin],
      scopes_supported: [...SUPPORTED_SCOPES],
      bearer_methods_supported: ["header"],
      resource_documentation: `${origin}/profile?tab=mcp`,
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
