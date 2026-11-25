import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { MCP_CORS_HEADERS, handleMcpOptions } from "@/lib/mcp/cors";

function loadIconBytes(): Buffer {
  const iconPath = path.resolve(process.cwd(), "public", "mcp-icon.png");
  return fs.readFileSync(iconPath);
}

export async function GET() {
  try {
    const bytes = loadIconBytes();
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...MCP_CORS_HEADERS,
        "Content-Type": "image/png",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404, headers: MCP_CORS_HEADERS });
  }
}

export async function HEAD() {
  try {
    const bytes = loadIconBytes();
    return new NextResponse(null, {
      status: 200,
      headers: {
        ...MCP_CORS_HEADERS,
        "Content-Type": "image/png",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404, headers: MCP_CORS_HEADERS });
  }
}

export async function OPTIONS() {
  return handleMcpOptions();
}
