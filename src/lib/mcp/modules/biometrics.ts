import { z } from "zod";
import type { McpModule } from "@/lib/mcp/registry";
import {
  type BiometricsPeriod,
  deleteBiometricRecords,
  getBiometricRecordById,
  getBiometricsSummary,
  getLatestBiometricRecord,
  queryBiometricRecords,
  toggleBiometricRecordStar,
} from "@/lib/services/biometricsService";

const PERIOD_ENUM = z.enum(["all", "1m", "3m", "6m", "1y"]);

export const biometricsModule: McpModule = {
  id: "biometrics",
  tools: [
    {
      name: "get_biometrics_summary",
      title: "Get Biometrics Summary",
      description:
        "Returns aggregated body composition progress (starting vs. current weight, body fat %, fat mass, muscle mass, skeletal muscle mass, deltas, and weight history), optionally filtered by time period.",
      requiredScope: "biometrics:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        period: PERIOD_ENUM.optional().describe(
          "Optional time horizon filter: all, 1m, 3m, 6m, or 1y."
        ),
      },
      handler: async (args: { period?: BiometricsPeriod }, ctx) =>
        getBiometricsSummary(ctx.auth.userId, { period: args.period }),
    },
    {
      name: "list_biometric_records",
      title: "List Biometric Records",
      description:
        "Returns a paginated, date-filtered list of bioimpedance body composition scans. Set include_segmental=true to include 5-segment metrics.",
      requiredScope: "biometrics:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        from: z.string().optional().describe("Start date (YYYY-MM-DD or ISO-8601)."),
        to: z.string().optional().describe("End date (YYYY-MM-DD or ISO-8601)."),
        starred_only: z.boolean().optional().describe("Filter to starred scans only."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Maximum records to return (1-200, default 50)."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Pagination offset (default 0)."),
        include_segmental: z
          .boolean()
          .optional()
          .describe("Include right/left arm, trunk, and right/left leg segmental fields."),
      },
      handler: async (
        args: {
          from?: string;
          to?: string;
          starred_only?: boolean;
          limit?: number;
          offset?: number;
          include_segmental?: boolean;
        },
        ctx
      ) =>
        queryBiometricRecords(ctx.auth.userId, {
          from: args.from,
          to: args.to,
          starredOnly: args.starred_only,
          limit: args.limit,
          offset: args.offset,
          includeSegmental: args.include_segmental,
        }),
    },
    {
      name: "get_biometric_record",
      title: "Get Biometric Record",
      description:
        "Returns full core and 5-segment bioimpedance metrics plus attached report metadata (filename, mime type, size) for a single scan.",
      requiredScope: "biometrics:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        record_id: z.number().int().positive().describe("Biometric record ID."),
      },
      handler: async (args: { record_id: number }, ctx) =>
        getBiometricRecordById(ctx.auth.userId, args.record_id),
    },
    {
      name: "toggle_biometric_record_star",
      title: "Toggle Biometric Record Star",
      description:
        "Sets or toggles the starred status on a biometric scan and automatically refreshes active auto_share_starred shared links.",
      requiredScope: "biometrics:write",
      accessMode: "write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        record_id: z.number().int().positive().describe("Biometric record ID."),
        starred: z
          .boolean()
          .optional()
          .describe("Explicit boolean value; omit to toggle the current starred state."),
      },
      handler: async (args: { record_id: number; starred?: boolean }, ctx) =>
        toggleBiometricRecordStar(ctx.auth.userId, args.record_id, args.starred),
    },
    {
      name: "delete_biometric_records",
      title: "Delete Biometric Records",
      description:
        "Permanently deletes specific biometric scans owned by the user. Ask for explicit user confirmation before invoking.",
      requiredScope: "biometrics:write",
      accessMode: "write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: {
        record_ids: z
          .array(z.number().int().positive())
          .min(1)
          .max(100)
          .describe("List of biometric record IDs to permanently delete."),
      },
      handler: async (args: { record_ids: number[] }, ctx) =>
        deleteBiometricRecords(ctx.auth.userId, args.record_ids),
    },
  ],
  resources: [
    {
      name: "biometrics_latest",
      uri: "recomp://biometrics/latest",
      title: "Latest Biometric Scan",
      description: "Most recent full biometric scan including core and segmental metrics.",
      mimeType: "application/json",
      requiredScope: "biometrics:read",
      handler: async (ctx) => {
        const latest = await getLatestBiometricRecord(ctx.auth.userId);
        return latest ?? { record: null, message: "No biometric records available." };
      },
    },
    {
      name: "biometrics_summary",
      uri: "recomp://biometrics/summary",
      title: "Biometrics Summary",
      description: "Overall body recomposition delta summary across all scans.",
      mimeType: "application/json",
      requiredScope: "biometrics:read",
      handler: async (ctx) => getBiometricsSummary(ctx.auth.userId, { period: "all" }),
    },
  ],
  prompts: [
    {
      name: "biometrics-segmental-analysis",
      title: "Biometrics Segmental Analysis",
      description:
        "Evaluates bilateral symmetry (Left vs. Right Arms/Legs and Trunk) across recent bioimpedance scans.",
      requiredScopes: ["biometrics:read"],
      argsSchema: {
        period: z
          .string()
          .optional()
          .describe("Optional lookback period (e.g., 1m, 3m, 6m, 1y, all)."),
      },
      handler: (args) => {
        const periodText = args.period ? ` over the "${args.period}" period` : "";
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Perform a bilateral segmental body-composition symmetry analysis${periodText}. Use \`list_biometric_records\` with \`include_segmental: true\` (and \`get_biometric_record\` for the latest scan) to compare Left vs. Right Arms, Left vs. Right Legs, and Trunk muscle mass (kg), fat mass (kg), muscle rate (%), and high/low frequency impedance. Report exact values with units without fabricating clinical diagnoses, and highlight notable left/right asymmetries or trend improvements.`,
              },
            },
          ],
        };
      },
    },
  ],
};
