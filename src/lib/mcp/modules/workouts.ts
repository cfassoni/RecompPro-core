import { z } from "zod";
import type { McpModule } from "@/lib/mcp/registry";
import {
  getMuscleReadiness,
  getWorkoutDetails,
  getWorkoutProgression,
  getWorkoutStats,
  listWorkouts,
  type WorkoutsPeriod,
} from "@/lib/services/workoutsService";

const PERIOD_ENUM = z.enum(["all", "1m", "3m", "6m", "1y"]);

export const workoutsModule: McpModule = {
  id: "workouts",
  tools: [
    {
      name: "list_workouts",
      title: "List Workouts",
      description:
        "Returns paginated workout history with duration, volume (kg), session/EPOC/total calories burned, effective RPE, and PR counts.",
      requiredScope: "workouts:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        page: z.number().int().min(1).optional().describe("Page number (default 1)."),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Workouts per page (1-100, default 20)."),
        from: z.string().optional().describe("Start date (YYYY-MM-DD or ISO-8601)."),
        to: z.string().optional().describe("End date (YYYY-MM-DD or ISO-8601)."),
      },
      handler: async (
        args: { page?: number; page_size?: number; from?: string; to?: string },
        ctx
      ) =>
        listWorkouts(ctx.auth.userId, {
          page: args.page,
          pageSize: args.page_size,
          from: args.from,
          to: args.to,
        }),
    },
    {
      name: "get_workout_details",
      title: "Get Workout Details",
      description:
        "Returns full workout breakdown by workout_id including exercises, sets, reps, load, RPE sanitization, PR deltas, and next-load double-progression prescription.",
      requiredScope: "workouts:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        workout_id: z.string().min(1).describe("Workout ID."),
      },
      handler: async (args: { workout_id: string }, ctx) =>
        getWorkoutDetails(ctx.auth.userId, args.workout_id),
    },
    {
      name: "get_workout_stats",
      title: "Get Workout Stats",
      description:
        "Returns aggregated training volume, duration, reps, caloric expenditure, current week summary, chart buckets, and calendar metadata.",
      requiredScope: "workouts:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        period: PERIOD_ENUM.optional().describe(
          "Time horizon: all, 1m, 3m (default), 6m, or 1y."
        ),
      },
      handler: async (args: { period?: WorkoutsPeriod }, ctx) =>
        getWorkoutStats(ctx.auth.userId, {
          period: args.period,
          lang: "en",
          includeCalories: true,
        }),
    },
    {
      name: "get_workout_progression",
      title: "Get Workout Progression",
      description:
        "Returns exercise-level PRs and load progression items over the selected period.",
      requiredScope: "workouts:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        period: PERIOD_ENUM.optional().describe(
          "Time horizon: all, 1m (default), 3m, 6m, or 1y."
        ),
      },
      handler: async (args: { period?: WorkoutsPeriod }, ctx) =>
        getWorkoutProgression(ctx.auth.userId, { period: args.period }),
    },
    {
      name: "get_muscle_readiness",
      title: "Get Muscle Readiness",
      description:
        "Returns personalized muscle group recovery percentages, remaining recovery hours, clinical readiness status, and training focus recommendation.",
      requiredScope: "workouts:read",
      accessMode: "read",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        language: z
          .enum(["en", "pt", "es"])
          .optional()
          .describe("Preferred response language for localized muscle names and guidance."),
      },
      handler: async (args: { language?: "en" | "pt" | "es" }, ctx) =>
        getMuscleReadiness(ctx.auth.userId, {
          lang: args.language,
          fallbackLang: "en",
        }),
    },
  ],
  resources: [
    {
      name: "workouts_readiness",
      uri: "recomp://workouts/readiness",
      title: "Muscle Recovery & Readiness",
      description: "Current muscle group recovery & training readiness snapshot.",
      mimeType: "application/json",
      requiredScope: "workouts:read",
      handler: async (ctx) =>
        getMuscleReadiness(ctx.auth.userId, { fallbackLang: "en" }),
    },
    {
      name: "workouts_stats_3m",
      uri: "recomp://workouts/stats/3m",
      title: "3-Month Workout Stats",
      description: "3-month workout volume, frequency, and caloric expenditure summary.",
      mimeType: "application/json",
      requiredScope: "workouts:read",
      handler: async (ctx) =>
        getWorkoutStats(ctx.auth.userId, {
          period: "3m",
          lang: "en",
          includeCalories: true,
        }),
    },
  ],
  prompts: [
    {
      name: "recomp-progress-review",
      title: "Body Recomposition Progress Review",
      description:
        "Guides the AI to correlate recent biometric body-fat/lean-mass trends with training volume and target weight progress.",
      requiredScopes: ["biometrics:read", "workouts:read"],
      argsSchema: {
        period: z
          .string()
          .optional()
          .describe("Time horizon to review (all, 1m, 3m, 6m, 1y)."),
      },
      handler: (args) => {
        const period = args.period || "3m";
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Conduct a comprehensive body recomposition progress review for the "${period}" period. Gather:\n1. \`get_biometrics_summary\` with period="${period}" (and \`get_user_profile\` if available for target weight).\n2. \`get_workout_stats\` with period="${period}" and \`get_workout_progression\` with period="${period}".\nCorrelate changes in weight (kg), body fat (%), fat mass (kg), and skeletal muscle mass (kg/%) against weekly training volume (kg), workout frequency, calories burned, and exercise PR progressions. State exact figures and distinguish direct measurements from analytical observations.`,
              },
            },
          ],
        };
      },
    },
    {
      name: "training-readiness-brief",
      title: "Training Readiness Brief",
      description:
        "Synthesizes muscle group recovery and recent PR prescriptions into today's training recommendation.",
      requiredScopes: ["workouts:read"],
      argsSchema: {
        target_focus: z
          .string()
          .optional()
          .describe("Optional muscle group or split focus the user has in mind."),
      },
      handler: (args) => {
        const focusNote = args.target_focus
          ? ` Pay special attention to the requested focus: "${args.target_focus}".`
          : "";
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Prepare today's training readiness brief.${focusNote} Call \`get_muscle_readiness\` and inspect recent sessions via \`list_workouts\` and \`get_workout_details\` to combine muscle recovery percentages, remaining recovery hours, effective RPE, and double-progression load prescriptions into an actionable session plan.`,
              },
            },
          ],
        };
      },
    },
  ],
};
