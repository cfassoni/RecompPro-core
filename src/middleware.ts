import { NextRequest, NextResponse } from "next/server";
import { MCP_CORS_HEADERS } from "@/lib/mcp/cors";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isMcpSurface =
    pathname === "/mcp" ||
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/oauth/");

  if (isMcpSurface) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: MCP_CORS_HEADERS,
      });
    }

    const res = NextResponse.next();
    for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
      res.headers.set(key, value);
    }
    return res;
  }

  const origin = req.headers.get("origin") || "*";

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.headers.set("Access-Control-Allow-Credentials", "true");

  return res;
}

export const config = {
  matcher: ["/api/:path*", "/uploads/:path*", "/mcp", "/.well-known/:path*", "/oauth/:path*"],
};
