import type { McpModule } from "@/lib/mcp/registry";
import { getUserProfileForMcp } from "@/lib/services/profileService";

export const profileModule: McpModule = {
  id: "profile",
  tools: [
    {
      name: "get_user_profile",
      title: "Get User Profile",
      description:
        "Returns the authenticated user's profile, body height, target weight, preferred language, and account metadata.",
      requiredScope: "profile:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (_args, ctx) => getUserProfileForMcp(ctx.auth.userId),
    },
  ],
  resources: [
    {
      name: "user_profile",
      uri: "recomp://profile",
      title: "User Profile",
      description: "Authenticated user's profile and target body weight.",
      mimeType: "application/json",
      requiredScope: "profile:read",
      handler: async (ctx) => getUserProfileForMcp(ctx.auth.userId),
    },
  ],
  prompts: [],
};
