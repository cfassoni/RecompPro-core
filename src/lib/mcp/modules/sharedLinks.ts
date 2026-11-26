import { z } from "zod";
import type { McpModule } from "@/lib/mcp/registry";
import {
  createSharedLink,
  deleteSharedLink,
  getSharedLinkDetailsForMcp,
  listSharedLinks,
  updateSharedLink,
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
    {
      name: "create_shared_link",
      title: "Create Shared Link",
      description:
        "Creates a snapshot shared report link for a coach or physician, optionally protected by password, expiration, and auto-sharing of starred scans.",
      requiredScope: "shared_links:write",
      accessMode: "write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: {
        description: z.string().min(1).describe("Human-readable label for this report link."),
        entry_ids: z
          .array(z.number().int().positive())
          .optional()
          .describe("Biometric record IDs to include in the snapshot."),
        auto_share_starred: z
          .boolean()
          .optional()
          .describe("Automatically keep all starred scans synchronized in this link."),
        include_attachments: z
          .boolean()
          .optional()
          .describe("Include uploaded PDF/image report attachments (default true)."),
        expires_at: z
          .string()
          .optional()
          .describe("Optional ISO-8601 expiration timestamp."),
        password: z
          .string()
          .optional()
          .describe("Optional guest access password."),
      },
      handler: async (
        args: {
          description: string;
          entry_ids?: number[];
          auto_share_starred?: boolean;
          include_attachments?: boolean;
          expires_at?: string;
          password?: string;
        },
        ctx
      ) => {
        const created = await createSharedLink(ctx.auth.userId, args);
        return {
          ...created,
          share_url: `${ctx.origin}/shared/${created.token}`,
        };
      },
    },
    {
      name: "update_shared_link",
      title: "Update Shared Link",
      description:
        "Updates description, expiration, auto_share_starred mode, or guest password on an existing shared link.",
      requiredScope: "shared_links:write",
      accessMode: "write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        link_id: z.string().min(1).describe("Shared link UUID."),
        description: z.string().optional().describe("Updated description."),
        expires_at: z
          .string()
          .optional()
          .describe("Updated ISO-8601 expiration timestamp."),
        clear_expires_at: z
          .boolean()
          .optional()
          .describe("Set true to remove expiration from this shared link."),
        auto_share_starred: z
          .boolean()
          .optional()
          .describe("Enable or disable automatic inclusion of starred scans."),
        password: z.string().optional().describe("Set or replace guest password."),
        clear_password: z
          .boolean()
          .optional()
          .describe("Set true to remove guest password protection."),
      },
      handler: async (
        args: {
          link_id: string;
          description?: string;
          expires_at?: string;
          clear_expires_at?: boolean;
          auto_share_starred?: boolean;
          password?: string;
          clear_password?: boolean;
        },
        ctx
      ) => {
        const updated = await updateSharedLink(ctx.auth.userId, args.link_id, {
          description: args.description,
          expires_at: args.clear_expires_at ? null : args.expires_at,
          auto_share_starred: args.auto_share_starred,
          password: args.password,
          clear_password: args.clear_password,
        });
        return {
          ...updated,
          share_url: `${ctx.origin}/shared/${updated.token}`,
        };
      },
    },
    {
      name: "delete_shared_link",
      title: "Delete Shared Link",
      description:
        "Permanently revokes and deletes a shared report link by link_id. Ask for explicit user confirmation before invoking.",
      requiredScope: "shared_links:write",
      accessMode: "write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: {
        link_id: z.string().min(1).describe("Shared link UUID to revoke and delete."),
      },
      handler: async (args: { link_id: string }, ctx) => {
        await deleteSharedLink(ctx.auth.userId, args.link_id);
        return {
          success: true,
          deleted_id: args.link_id,
        };
      },
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
