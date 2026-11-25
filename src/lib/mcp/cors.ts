import { NextResponse } from "next/server";

export const MCP_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};

/** Handles CORS preflight OPTIONS requests on MCP, discovery, and OAuth endpoints. */
export function handleMcpOptions(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: MCP_CORS_HEADERS,
  });
}

/** Attaches standard MCP CORS headers onto any Web Response. */
export function withMcpCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/** Returns a standardized 503 response when ENABLE_MCP_SERVER=false. */
export function mcpDisabledResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "mcp_disabled",
      error_description: "The Recomp Pro MCP server is disabled by server configuration.",
    },
    {
      status: 503,
      headers: MCP_CORS_HEADERS,
    }
  );
}
