import { NextRequest, NextResponse } from "next/server";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import {
  MCP_CORS_HEADERS,
  handleMcpOptions,
  mcpDisabledResponse,
} from "@/lib/mcp/cors";
import {
  DcrValidationError,
  registerDynamicClient,
  type DcrRequestBody,
} from "@/lib/mcp/oauth/dcr";

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  let body: DcrRequestBody;
  try {
    body = (await req.json()) as DcrRequestBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Request body must be valid JSON" },
      { status: 400, headers: MCP_CORS_HEADERS }
    );
  }

  try {
    const registration = await registerDynamicClient(body, getClientIp(req));
    return NextResponse.json(registration, {
      status: 201,
      headers: {
        ...MCP_CORS_HEADERS,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof DcrValidationError) {
      return NextResponse.json(
        { error: err.code, error_description: err.message },
        { status: err.status, headers: MCP_CORS_HEADERS }
      );
    }
    console.error("OAuth DCR error:", err);
    return NextResponse.json(
      { error: "server_error", error_description: "Failed to register client" },
      { status: 500, headers: MCP_CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return handleMcpOptions();
}
