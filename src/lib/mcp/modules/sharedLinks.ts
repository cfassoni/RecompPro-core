import { z } from "zod";
import type { McpModule } from "@/lib/mcp/registry";
import {
  getSharedLinkDetailsForMcp,
  listSharedLinks,
} from "@/lib/services/sharedLinksService";

export const sharedLinksModule: McpModule = {
  id: "sharedLinks",
  tools: [
    {
      name: "list_shared_links",
      title: "List Shared Links",
      description:
        "Lists the user's shared report links with expiration, password protection status, auto-share starred flag, entry counts, and access counts.",
      requiredScope: "shared_links:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (_args, ctx) => {
        const links = await listSharedLinks(ctx.auth.userId);
        return links.map((link) => ({
          ...link,
          share_url: `${ctx.origin}/shared/${link.token}`,
        }));
      },
    },
    {
      name: "get_shared_link_details",
      title: "Get Shared Link Details",
      description:
        "Returns shared link metadata, included biometric record summaries, and sanitized access audit summary (timestamps and status only; visitor IPs excluded).",
      requiredScope: "shared_links:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        link_id: z.string().min(1).describe("Shared link UUID."),
      },
      handler: async (args: { link_id: string }, ctx) =>
        getSharedLinkDetailsForMcp(ctx.auth.userId, args.link_id, ctx.origin),
    },
  ],
  resources: [],
  prompts: [
    {
      name: "prepare-coach-report",
      title: "Prepare Coach or Physician Report",
      description:
        "Summarizes key starred biometric scans and recent workouts and assists the user in preparing a shared report link for a coach or physician.",
      requiredScopes: ["biometrics:read"],
      argsSchema: {
        recipient: z
          .string()
          .optional()
          .describe("Intended recipient (e.g., strength coach, nutritionist, physician)."),
      },
      handler: (args) => {
        const recipientLabel = args.recipient || "coach or physician";
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Help prepare a clean progress report for my ${recipientLabel}. Inspect starred biometric scans via \`list_biometric_records\` (\`starred_only: true\`) and overall progress via \`get_biometrics_summary\`. If workout data is accessible, summarize recent training consistency with \`get_workout_stats\`. Propose a concise shared-link description, recommended record IDs (or \`auto_share_starred: true\`), and summarize the key body composition and training highlights ready to share.`,
              },
            },
          ],
        };
      },
    },
  ],
};
