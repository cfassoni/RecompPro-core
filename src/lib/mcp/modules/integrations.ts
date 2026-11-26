import type { McpModule } from "@/lib/mcp/registry";
import { listIntegrations } from "@/lib/services/integrationsService";

export const integrationsModule: McpModule = {
  id: "integrations",
  tools: [
    {
      name: "list_integrations",
      title: "List Integrations",
      description:
        "Lists connected Fitdays and Hevy integrations, sync status, last sync timestamp, last error, and sanitized non-secret configuration.",
      requiredScope: "integrations:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (_args, ctx) =>
        listIntegrations(ctx.auth.userId, { redactSecrets: true }),
    },
  ],
  resources: [
    {
      name: "integrations_status",
      uri: "recomp://integrations/status",
      title: "Integrations Status",
      description: "Sanitized Fitdays and Hevy connection & last-sync status.",
      mimeType: "application/json",
      requiredScope: "integrations:read",
      handler: async (ctx) =>
        listIntegrations(ctx.auth.userId, { redactSecrets: true }),
    },
  ],
  prompts: [],
};
