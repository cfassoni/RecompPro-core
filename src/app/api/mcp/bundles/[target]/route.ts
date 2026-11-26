import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import { getCanonicalOrigin } from "@/lib/mcp/config";
import { mcpDisabledResponse } from "@/lib/mcp/cors";
import {
  buildMcpPluginBundle,
  parseBundleTarget,
} from "@/lib/mcp/bundleGenerator";

export const GET = withAuth(async (req, { params }) => {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  const rawTarget = String(params?.target || "");
  const target = parseBundleTarget(rawTarget);
  if (!target) {
    return NextResponse.json(
      { detail: "Invalid bundle target. Expected antigravity, claude, or chatgpt." },
      { status: 400 }
    );
  }

  try {
    const origin = getCanonicalOrigin(req);
    const { filename, buffer } = buildMcpPluginBundle(target, origin);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Failed to generate MCP plugin bundle:", err);
    return NextResponse.json(
      { detail: "Failed to generate plugin bundle" },
      { status: 500 }
    );
  }
});
