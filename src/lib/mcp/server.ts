import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAppVersion } from "@/lib/mcp/config";
import type { McpAuthContext } from "@/lib/mcp/auth";
import { type McpModule, registerModulesOnMcpServer } from "@/lib/mcp/registry";
import { systemModule } from "@/lib/mcp/modules/system";
import { profileModule } from "@/lib/mcp/modules/profile";
import { biometricsModule } from "@/lib/mcp/modules/biometrics";
import { workoutsModule } from "@/lib/mcp/modules/workouts";
import { integrationsModule } from "@/lib/mcp/modules/integrations";
import { sharedLinksModule } from "@/lib/mcp/modules/sharedLinks";

export const ALL_MCP_MODULES: readonly McpModule[] = [
  systemModule,
  profileModule,
  biometricsModule,
  workoutsModule,
  integrationsModule,
  sharedLinksModule,
];

/**
 * Instantiates a request-scoped Recomp Pro MCP Server with SEP-973 metadata
 * and scope-filtered domain modules.
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

  registerModulesOnMcpServer(server, ALL_MCP_MODULES, {
    auth,
    origin,
    version,
  });

  return server;
}
