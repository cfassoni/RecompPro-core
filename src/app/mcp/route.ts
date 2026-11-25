import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import { authenticateMcpRequest, buildWwwAuthenticateHeader } from "@/lib/mcp/auth";
import { getCanonicalOrigin } from "@/lib/mcp/config";
import {
  MCP_CORS_HEADERS,
  handleMcpOptions,
  mcpDisabledResponse,
  withMcpCors,
} from "@/lib/mcp/cors";
import { createRecompMcpServer } from "@/lib/mcp/server";

function unauthorizedMcpResponse(req: NextRequest): NextResponse {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Unauthorized: valid Bearer token required in Authorization header",
      },
      id: null,
    },
    {
      status: 401,
      headers: {
        ...MCP_CORS_HEADERS,
        "WWW-Authenticate": buildWwwAuthenticateHeader(req),
      },
    }
  );
}

export async function POST(req: NextRequest) {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  const auth = await authenticateMcpRequest(req);
  if (!auth) {
    return unauthorizedMcpResponse(req);
  }

  const origin = getCanonicalOrigin(req);
  const server = createRecompMcpServer(auth, origin);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  const response = await transport.handleRequest(req);
  return withMcpCors(response);
}

export async function GET(req: NextRequest) {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  const auth = await authenticateMcpRequest(req);
  if (!auth) {
    return unauthorizedMcpResponse(req);
  }

  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed in stateless Streamable HTTP mode; use POST /mcp",
      },
      id: null,
    },
    {
      status: 405,
      headers: {
        ...MCP_CORS_HEADERS,
        Allow: "POST, OPTIONS",
      },
    }
  );
}

export async function DELETE(req: NextRequest) {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  const auth = await authenticateMcpRequest(req);
  if (!auth) {
    return unauthorizedMcpResponse(req);
  }

  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed in stateless Streamable HTTP mode",
      },
      id: null,
    },
    {
      status: 405,
      headers: {
        ...MCP_CORS_HEADERS,
        Allow: "POST, OPTIONS",
      },
    }
  );
}

export async function OPTIONS() {
  return handleMcpOptions();
}
