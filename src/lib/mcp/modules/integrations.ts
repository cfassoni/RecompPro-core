import { z } from "zod";
import type { McpModule } from "@/lib/mcp/registry";
import {
  listIntegrations,
  triggerFitdaysSync,
  triggerHevySync,
} from "@/lib/services/integrationsService";

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
    {
      name: "trigger_fitdays_sync",
      title: "Trigger Fitdays Sync",
      description:
        "Triggers an incremental or full Fitdays Cloud synchronization for the configured member profile and returns inserted/updated record counts.",
      requiredScope: "integrations:write",
      accessMode: "write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        force_full: z
          .boolean()
          .optional()
          .describe("When true, fetches full scan history instead of incremental updates."),
      },
      handler: async (args: { force_full?: boolean }, ctx) =>
        triggerFitdaysSync(ctx.auth.userId, { forceFull: args.force_full }),
    },
    {
      name: "trigger_hevy_sync",
      title: "Trigger Hevy Sync",
      description:
        "Triggers an incremental or full Hevy strength workout synchronization and returns synced workout counts.",
      requiredScope: "integrations:write",
      accessMode: "write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        force_full: z
          .boolean()
          .optional()
          .describe("When true, performs a full workout history sync."),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Hevy API page size (1-10, default 10)."),
      },
      handler: async (args: { force_full?: boolean; page_size?: number }, ctx) =>
        triggerHevySync(ctx.auth.userId, {
          forceFull: args.force_full,
          pageSize: args.page_size,
        }),
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
