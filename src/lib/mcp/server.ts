import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAppVersion } from "@/lib/mcp/config";
import type { McpAuthContext } from "@/lib/mcp/auth";
import { isReadOnlyScopes } from "@/lib/mcp/scopes";

/**
 * Instantiates a request-scoped Recomp Pro MCP Server with SEP-973 metadata.
 */
export function createRecompMcpServer(auth: McpAuthContext, origin: string): McpServer {
  const version = getAppVersion();

  const server = new McpServer({
    name: "recomp-pro",
    title: "Recomp Pro",
    version,
    websiteUrl: origin,
    description:
      "Body composition, strength training volume, muscle readiness, and shared report telemetry for Recomp Pro.",
    icons: [
      {
        src: `${origin}/icon.png`,
        mimeType: "image/png",
        sizes: ["512x512"],
      },
    ],
  });

  server.registerTool(
    "about",
    {
      title: "About Recomp Pro MCP",
      description:
        "Returns Recomp Pro server metadata, authenticated user context, granted scopes, and enabled capabilities.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const payload = {
        name: "recomp-pro",
        title: "Recomp Pro",
        version,
        websiteUrl: origin,
        user: {
          id: auth.userId,
          email: auth.userEmail,
        },
        auth: {
          method: auth.authMethod,
          client: auth.clientLabel,
          readOnly: isReadOnlyScopes(auth.scopes),
          scopes: auth.scopes,
        },
        capabilities: {
          phase: 1,
          modules: ["system"],
        },
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );

  return server;
}
