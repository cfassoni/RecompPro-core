import { z } from "zod";
import type { McpModule } from "@/lib/mcp/registry";
import {
  getUserProfileForMcp,
  updateUserProfile,
} from "@/lib/services/profileService";

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
    {
      name: "update_user_profile",
      title: "Update User Profile",
      description:
        "Updates user profile fields (display_name, gender, birthday, height_cm, target_weight_kg, preferred_language). Email changes are excluded for security.",
      requiredScope: "profile:write",
      accessMode: "write",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        display_name: z.string().optional().describe("Display name."),
        gender: z.string().optional().describe("Biological sex / gender."),
        birthday: z
          .string()
          .optional()
          .describe("Birth date in YYYY-MM-DD format."),
        height_cm: z
          .number()
          .positive()
          .max(300)
          .optional()
          .describe("Height in centimeters."),
        target_weight_kg: z
          .number()
          .positive()
          .max(500)
          .optional()
          .describe("Target weight in kilograms."),
        preferred_language: z
          .enum(["en", "pt", "es"])
          .optional()
          .describe("Preferred language (en, pt, or es)."),
      },
      handler: async (
        args: {
          display_name?: string;
          gender?: string;
          birthday?: string;
          height_cm?: number;
          target_weight_kg?: number;
          preferred_language?: "en" | "pt" | "es";
        },
        ctx
      ) => {
        const updated = await updateUserProfile(
          ctx.auth.userId,
          {
            display_name: args.display_name,
            gender: args.gender,
            birthday: args.birthday,
            height_cm: args.height_cm,
            target_weight_kg: args.target_weight_kg,
            preferred_language: args.preferred_language,
          },
          { allowEmailChange: false }
        );
        const { profile_image_path: _omitted, ...safeProfile } = updated;
        void _omitted;
        return safeProfile;
      },
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
