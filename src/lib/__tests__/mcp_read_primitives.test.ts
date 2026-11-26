import crypto from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/db/client";
import {
  exerciseTemplates,
  recompRecords,
  recompReports,
  sharedLinkAuditLogs,
  sharedLinks,
  userIntegrations,
  users,
  workoutExercises,
  workouts,
  workoutSets,
} from "@/db/schema";
import { ensureTablesExist } from "@/db/initDb";
import { hashPassword } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { createPersonalAccessToken } from "@/lib/mcp/oauth/tokens";
import { POST as mcpPost } from "@/app/mcp/route";

async function parseMcpResponse(res: Response): Promise<Record<string, unknown>> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await res.json()) as Record<string, unknown>;
  }
  const text = await res.text();
  const dataLines = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  return JSON.parse(dataLines[dataLines.length - 1]) as Record<string, unknown>;
}

async function rpc(
  token: string,
  id: number,
  method: string,
  params: Record<string, unknown> = {}
) {
  const res = await mcpPost(
    new NextRequest("https://recomp.example.com/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
    })
  );
  const payload = await parseMcpResponse(res);
  return { status: res.status, payload };
}

function parseToolJson(payload: Record<string, unknown>): Record<string, unknown> {
  const result = payload.result as {
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
  };
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("MCP Phase 2: Read Tools, Resources, Prompts & Scope Isolation", () => {
  let fullReadToken = "";
  let profileOnlyToken = "";
  let biometricsOnlyToken = "";
  let otherUserToken = "";

  let starredRecordId = 0;
  let oldRecordId = 0;
  let workoutId2 = "";
  let sharedLinkId = "";

  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    await ensureTablesExist();

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const hashedPassword = await hashPassword("StrongPass123!");

    const [user1] = await db
      .insert(users)
      .values({
        email: `mcp_read_u1_${suffix}@example.com`,
        hashedPassword,
        displayName: "MCP Reader",
        gender: "male",
        birthday: "1992-04-10",
        heightCm: 180,
        targetWeightKg: 75,
        profileImagePath: "/app/data/profile_pics/secret_internal_avatar.png",
        preferredLanguage: "en",
        emailConfirmed: true,
      })
      .returning();

    const [user2] = await db
      .insert(users)
      .values({
        email: `mcp_read_u2_${suffix}@example.com`,
        hashedPassword,
        displayName: "Other User",
        emailConfirmed: true,
        preferredLanguage: "en",
      })
      .returning();

    fullReadToken = (
      await createPersonalAccessToken({
        userId: user1.id,
        name: "Full Read PAT",
        scopes: ["recomp:read"],
      })
    ).token;

    profileOnlyToken = (
      await createPersonalAccessToken({
        userId: user1.id,
        name: "Profile Only PAT",
        scopes: ["profile:read"],
      })
    ).token;

    biometricsOnlyToken = (
      await createPersonalAccessToken({
        userId: user1.id,
        name: "Biometrics Only PAT",
        scopes: ["biometrics:read"],
      })
    ).token;

    otherUserToken = (
      await createPersonalAccessToken({
        userId: user2.id,
        name: "Other User PAT",
        scopes: ["recomp:read"],
      })
    ).token;

    // Seed 2 biometric scans (one 45 days ago, one 2 days ago starred with attached report)
    const [recOld] = await db
      .insert(recompRecords)
      .values({
        userId: user1.id,
        date: daysAgo(45),
        starred: false,
        weight: 80.0,
        bmi: 24.7,
        bodyFatPct: 20.0,
        subcutaneousFatPct: 16.5,
        heartRate: 64,
        heartIndex: 2.8,
        visceralFat: 8,
        bodyWaterPct: 57.0,
        skeletalMuscleMassPct: 44.0,
        muscleMass: 59.0,
        boneMass: 3.3,
        proteinPct: 18.0,
        bmr: 1710,
        metabolicAge: 30,
        fatMass: 16.0,
        moistureContent: 45.6,
        skeletalMuscleMass: 35.2,
        muscleRatePct: 73.8,
        proteinMass: 14.4,
        obesityScore: 1,
        fatFreeMass: 64.0,
        smi: 8.3,
        bodyScore: 82,
        targetWeight: 75.0,
        weightControl: -5.0,
        fatControl: -5.0,
        muscleControl: 0.0,
        rightArmMuscleMass: 3.4,
        leftArmMuscleMass: 3.3,
      })
      .returning();
    oldRecordId = recOld.id;

    const [recNew] = await db
      .insert(recompRecords)
      .values({
        userId: user1.id,
        date: daysAgo(2),
        starred: true,
        weight: 77.5,
        bmi: 23.9,
        bodyFatPct: 17.5,
        subcutaneousFatPct: 14.2,
        heartRate: 60,
        heartIndex: 2.7,
        visceralFat: 6,
        bodyWaterPct: 59.0,
        skeletalMuscleMassPct: 46.0,
        muscleMass: 59.5,
        boneMass: 3.3,
        proteinPct: 19.0,
        bmr: 1725,
        metabolicAge: 28,
        fatMass: 13.6,
        moistureContent: 45.7,
        skeletalMuscleMass: 35.6,
        muscleRatePct: 76.8,
        proteinMass: 14.7,
        obesityScore: 0,
        fatFreeMass: 63.9,
        smi: 8.5,
        bodyScore: 89,
        targetWeight: 75.0,
        weightControl: -2.5,
        fatControl: -2.5,
        muscleControl: 0.5,
        rightArmFatMass: 0.9,
        leftArmFatMass: 0.9,
        rightArmMuscleMass: 3.6,
        leftArmMuscleMass: 3.55,
        trunkMuscleMass: 28.5,
        rightLegMuscleMass: 9.8,
        leftLegMuscleMass: 9.7,
      })
      .returning();
    starredRecordId = recNew.id;

    await db.insert(recompReports).values({
      recordId: starredRecordId,
      filePath: "/app/data/reports/internal_secret_report.pdf",
      filename: "scan_latest.pdf",
      mimeType: "application/pdf",
      fileSize: 4096,
    });

    // Seed exercise template + 2 workouts for progressive overload & readiness
    const tplId = `tpl-mcp-bench-${suffix}`;
    await db.insert(exerciseTemplates).values({
      id: tplId,
      title: "Bench Press (Barbell)",
      primaryMuscleGroup: "chest",
      equipment: "barbell",
      isCustom: false,
    });

    const w1Id = `w-mcp-1-${suffix}`;
    workoutId2 = `w-mcp-2-${suffix}`;

    await db.insert(workouts).values([
      {
        id: w1Id,
        userId: user1.id,
        title: "Push Session A",
        description: "Baseline press",
        startTime: daysAgo(10),
        endTime: new Date(daysAgo(10).getTime() + 3600000),
        durationSeconds: 3600,
        totalVolumeKg: 800,
        sessionCaloriesBurned: 280,
        epocCaloriesBurned: 42,
        totalCaloriesBurned: 322,
        avgRpe: 8.0,
        source: "hevy",
      },
      {
        id: workoutId2,
        userId: user1.id,
        title: "Push Session B",
        description: "PR day",
        startTime: daysAgo(1),
        endTime: new Date(daysAgo(1).getTime() + 3600000),
        durationSeconds: 3600,
        totalVolumeKg: 900,
        sessionCaloriesBurned: 310,
        epocCaloriesBurned: 48,
        totalCaloriesBurned: 358,
        avgRpe: 8.5,
        source: "hevy",
      },
    ]);

    const [ex1] = await db
      .insert(workoutExercises)
      .values({
        workoutId: w1Id,
        exerciseTemplateId: tplId,
        title: "Bench Press (Barbell)",
        index: 0,
      })
      .returning();

    const [ex2] = await db
      .insert(workoutExercises)
      .values({
        workoutId: workoutId2,
        exerciseTemplateId: tplId,
        title: "Bench Press (Barbell)",
        index: 0,
      })
      .returning();

    await db.insert(workoutSets).values([
      {
        workoutExerciseId: ex1.id,
        index: 0,
        type: "normal",
        weightKg: 80,
        reps: 10,
        rpe: 8,
      },
      {
        workoutExerciseId: ex2.id,
        index: 0,
        type: "normal",
        weightKg: 90,
        reps: 10,
        rpe: 8.5,
      },
    ]);

    // Seed Fitdays & Hevy integrations with sensitive webhookToken / encryptedCredentials
    await db.insert(userIntegrations).values([
      {
        userId: user1.id,
        provider: "fitdays",
        accountIdentifier: "fitdays@example.com",
        encryptedCredentials: encryptJson({ email: "fitdays@example.com", token: "SUPER_SECRET" }),
        configJson: JSON.stringify({
          selectedSuid: 1001,
          selectedProfileName: "MCP Reader",
          skipWeightOnly: true,
        }),
        status: "connected",
        lastSyncedAt: daysAgo(1),
      },
      {
        userId: user1.id,
        provider: "hevy",
        accountIdentifier: "mcp_lifter",
        encryptedCredentials: encryptJson({ apiKey: "SECRET_HEVY_API_KEY" }),
        configJson: JSON.stringify({
          webhookToken: "SECRET_WEBHOOK_TOKEN_DO_NOT_LEAK",
          username: "mcp_lifter",
        }),
        status: "connected",
        lastSyncedAt: daysAgo(1),
      },
    ]);

    // Seed Shared Link + Audit Log with visitor IP & User-Agent
    sharedLinkId = crypto.randomUUID();
    const shareToken = crypto.randomUUID();
    await db.insert(sharedLinks).values({
      id: sharedLinkId,
      ownerId: user1.id,
      token: shareToken,
      description: "Coach Q4 Check-in",
      includeAttachments: true,
      autoShareStarred: true,
      manualEntryIds: JSON.stringify([starredRecordId]),
      snapshotData: JSON.stringify([
        {
          id: starredRecordId,
          date: recNew.date.toISOString(),
          weight: 77.5,
          bmi: 23.9,
          body_fat_pct: 17.5,
          muscle_mass: 59.5,
          skeletal_muscle_mass: 35.6,
          report: {
            id: 1,
            filename: "scan_latest.pdf",
            file_path: "/app/data/reports/internal_secret_report.pdf",
          },
        },
      ]),
    });

    await db.insert(sharedLinkAuditLogs).values({
      sharedLinkId,
      ipAddress: "203.0.113.42",
      userAgent: "SecretCoachBrowser/9.9",
      status: "success",
      accessedAt: daysAgo(1),
    });
  });

  it("discovers all 13 v1 read tools, 6 resources, and 4 prompts with recomp:read scope", async () => {
    const toolsRes = await rpc(fullReadToken, 1, "tools/list");
    expect(toolsRes.status).toBe(200);
    const tools = (
      toolsRes.payload.result as {
        tools: Array<{
          name: string;
          annotations?: {
            readOnlyHint?: boolean;
            destructiveHint?: boolean;
          };
        }>;
      }
    ).tools;

    expect(tools.map((t) => t.name).sort()).toEqual([
      "about",
      "get_biometric_record",
      "get_biometrics_summary",
      "get_muscle_readiness",
      "get_shared_link_details",
      "get_user_profile",
      "get_workout_details",
      "get_workout_progression",
      "get_workout_stats",
      "list_biometric_records",
      "list_integrations",
      "list_shared_links",
      "list_workouts",
    ]);

    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
    }

    const resourcesRes = await rpc(fullReadToken, 2, "resources/list");
    expect(resourcesRes.status).toBe(200);
    const resources = (
      resourcesRes.payload.result as { resources: Array<{ uri: string }> }
    ).resources;
    expect(resources.map((r) => r.uri).sort()).toEqual([
      "recomp://biometrics/latest",
      "recomp://biometrics/summary",
      "recomp://integrations/status",
      "recomp://profile",
      "recomp://workouts/readiness",
      "recomp://workouts/stats/3m",
    ]);

    const promptsRes = await rpc(fullReadToken, 3, "prompts/list");
    expect(promptsRes.status).toBe(200);
    const prompts = (
      promptsRes.payload.result as { prompts: Array<{ name: string }> }
    ).prompts;
    expect(prompts.map((p) => p.name).sort()).toEqual([
      "biometrics-segmental-analysis",
      "prepare-coach-report",
      "recomp-progress-review",
      "training-readiness-brief",
    ]);
  });

  it("executes profile, biometrics, workouts, integrations, and shared_links read tools safely", async () => {
    // 1. about
    const aboutRes = await rpc(fullReadToken, 10, "tools/call", {
      name: "about",
      arguments: {},
    });
    const about = parseToolJson(aboutRes.payload);
    expect((about.capabilities as { phase: number }).phase).toBe(2);

    // 2. get_user_profile (no internal profile_image_path)
    const profileRes = await rpc(fullReadToken, 11, "tools/call", {
      name: "get_user_profile",
      arguments: {},
    });
    const profile = parseToolJson(profileRes.payload);
    expect(profile.display_name).toBe("MCP Reader");
    expect(profile.target_weight_kg).toBe(75);
    expect(profile.profile_image_path).toBeUndefined();

    // 3. get_biometrics_summary (all vs 1m)
    const sumAllRes = await rpc(fullReadToken, 12, "tools/call", {
      name: "get_biometrics_summary",
      arguments: { period: "all" },
    });
    const sumAll = parseToolJson(sumAllRes.payload);
    expect(sumAll.total_records).toBe(2);
    expect(sumAll.weight_change).toBe(-2.5);

    const sum1mRes = await rpc(fullReadToken, 13, "tools/call", {
      name: "get_biometrics_summary",
      arguments: { period: "1m" },
    });
    const sum1m = parseToolJson(sum1mRes.payload);
    expect(sum1m.total_records).toBe(1);

    // 4. list_biometric_records (starred_only + include_segmental)
    const listCompactRes = await rpc(fullReadToken, 14, "tools/call", {
      name: "list_biometric_records",
      arguments: { starred_only: true, include_segmental: false },
    });
    const listCompact = parseToolJson(listCompactRes.payload) as {
      total: number;
      records: Array<Record<string, unknown>>;
    };
    expect(listCompact.total).toBe(1);
    expect(listCompact.records[0].id).toBe(starredRecordId);
    expect(listCompact.records[0].right_arm_muscle_mass).toBeUndefined();

    const listSegRes = await rpc(fullReadToken, 15, "tools/call", {
      name: "list_biometric_records",
      arguments: { limit: 1, offset: 1, include_segmental: true },
    });
    const listSeg = parseToolJson(listSegRes.payload) as {
      total: number;
      has_more: boolean;
      records: Array<Record<string, unknown>>;
    };
    expect(listSeg.total).toBe(2);
    expect(listSeg.has_more).toBe(false);
    expect(listSeg.records[0].id).toBe(oldRecordId);
    expect(listSeg.records[0].right_arm_muscle_mass).toBe(3.4);

    // 5. get_biometric_record
    const recRes = await rpc(fullReadToken, 16, "tools/call", {
      name: "get_biometric_record",
      arguments: { record_id: starredRecordId },
    });
    const rec = parseToolJson(recRes.payload) as {
      id: number;
      trunk_muscle_mass: number;
      report: { filename: string; file_path?: string };
    };
    expect(rec.id).toBe(starredRecordId);
    expect(rec.trunk_muscle_mass).toBe(28.5);
    expect(rec.report.filename).toBe("scan_latest.pdf");
    expect(rec.report.file_path).toBeUndefined();

    // 6. list_workouts, get_workout_details, get_workout_stats, get_workout_progression, get_muscle_readiness
    const wListRes = await rpc(fullReadToken, 17, "tools/call", {
      name: "list_workouts",
      arguments: { page: 1, page_size: 10 },
    });
    const wList = parseToolJson(wListRes.payload) as {
      total: number;
      workouts: Array<{ id: string; hasProgression: boolean }>;
    };
    expect(wList.total).toBe(2);
    expect(wList.workouts[0].id).toBe(workoutId2);
    expect(wList.workouts[0].hasProgression).toBe(true);

    const wDetailRes = await rpc(fullReadToken, 18, "tools/call", {
      name: "get_workout_details",
      arguments: { workout_id: workoutId2 },
    });
    const wDetail = parseToolJson(wDetailRes.payload) as {
      title: string;
      exercises: Array<{ progressionPrescription: { action: string } }>;
    };
    expect(wDetail.title).toBe("Push Session B");
    expect(wDetail.exercises[0].progressionPrescription.action).toBeTruthy();

    const wStatsRes = await rpc(fullReadToken, 19, "tools/call", {
      name: "get_workout_stats",
      arguments: { period: "3m" },
    });
    const wStats = parseToolJson(wStatsRes.payload) as {
      summary: { totalWorkouts: number };
      calories: { totalCaloriesBurned: number };
    };
    expect(wStats.summary.totalWorkouts).toBe(2);
    expect(wStats.calories.totalCaloriesBurned).toBe(680);

    const wProgRes = await rpc(fullReadToken, 20, "tools/call", {
      name: "get_workout_progression",
      arguments: { period: "3m" },
    });
    const wProg = parseToolJson(wProgRes.payload) as {
      totalPrsInPeriod: number;
      items: Array<{ deltaWeightKg: number }>;
    };
    expect(wProg.totalPrsInPeriod).toBeGreaterThan(0);
    expect(wProg.items[0].deltaWeightKg).toBe(10);

    const readinessRes = await rpc(fullReadToken, 21, "tools/call", {
      name: "get_muscle_readiness",
      arguments: { language: "en" },
    });
    const readiness = parseToolJson(readinessRes.payload) as {
      muscleGroups: Array<{ group: string }>;
      overallReadiness: string;
    };
    expect(readiness.muscleGroups.length).toBeGreaterThan(0);
    expect(["ready", "recovering", "exhausted"]).toContain(readiness.overallReadiness);

    // 7. list_integrations (secret redaction)
    const intRes = await rpc(fullReadToken, 22, "tools/call", {
      name: "list_integrations",
      arguments: {},
    });
    const intText = JSON.stringify(intRes.payload);
    expect(intText).not.toContain("SECRET_WEBHOOK_TOKEN_DO_NOT_LEAK");
    expect(intText).not.toContain("SECRET_HEVY_API_KEY");
    expect(intText).not.toContain("SUPER_SECRET");
    const integrations = parseToolJson(intRes.payload) as unknown as Array<{
      provider: string;
      config: { hasWebhookConfigured?: boolean; webhookToken?: string };
    }>;
    const hevyInt = integrations.find((i) => i.provider === "hevy");
    expect(hevyInt?.config.hasWebhookConfigured).toBe(true);
    expect(hevyInt?.config.webhookToken).toBeUndefined();

    // 8. list_shared_links & get_shared_link_details (no visitor IP/UA, no file_path)
    const linksRes = await rpc(fullReadToken, 23, "tools/call", {
      name: "list_shared_links",
      arguments: {},
    });
    const links = parseToolJson(linksRes.payload) as unknown as Array<{
      id: string;
      share_url: string;
      access_count: number;
    }>;
    expect(links).toHaveLength(1);
    expect(links[0].id).toBe(sharedLinkId);
    expect(links[0].share_url).toContain("https://recomp.example.com/shared/");
    expect(links[0].access_count).toBe(1);

    const linkDetailRes = await rpc(fullReadToken, 24, "tools/call", {
      name: "get_shared_link_details",
      arguments: { link_id: sharedLinkId },
    });
    const linkDetailText = JSON.stringify(linkDetailRes.payload);
    expect(linkDetailText).not.toContain("203.0.113.42");
    expect(linkDetailText).not.toContain("SecretCoachBrowser");
    expect(linkDetailText).not.toContain("internal_secret_report.pdf");
    const linkDetail = parseToolJson(linkDetailRes.payload) as {
      included_records: Array<{ id: number; has_report: boolean }>;
      access_audit_summary: {
        total_attempts: number;
        successful_accesses: number;
        recent_events: Array<{ accessed_at: string; status: string }>;
      };
    };
    expect(linkDetail.included_records[0].id).toBe(starredRecordId);
    expect(linkDetail.included_records[0].has_report).toBe(true);
    expect(linkDetail.access_audit_summary.total_attempts).toBe(1);
    expect(linkDetail.access_audit_summary.recent_events[0].status).toBe("success");
  });

  it("reads all 6 recomp:// resources and gets all 4 prompts", async () => {
    const resourceUris = [
      "recomp://profile",
      "recomp://biometrics/latest",
      "recomp://biometrics/summary",
      "recomp://workouts/readiness",
      "recomp://workouts/stats/3m",
      "recomp://integrations/status",
    ];

    for (let i = 0; i < resourceUris.length; i++) {
      const uri = resourceUris[i];
      const res = await rpc(fullReadToken, 100 + i, "resources/read", { uri });
      expect(res.status).toBe(200);
      const contents = (
        res.payload.result as {
          contents: Array<{ uri: string; mimeType: string; text: string }>;
        }
      ).contents;
      expect(contents[0].uri).toBe(uri);
      expect(contents[0].mimeType).toBe("application/json");
      const parsed = JSON.parse(contents[0].text) as unknown;
      expect(parsed).toBeDefined();
      if (uri === "recomp://integrations/status") {
        expect(contents[0].text).not.toContain("SECRET_WEBHOOK_TOKEN_DO_NOT_LEAK");
      }
    }

    const promptCases = [
      { name: "recomp-progress-review", arguments: { period: "3m" } },
      { name: "training-readiness-brief", arguments: { target_focus: "upper body" } },
      { name: "biometrics-segmental-analysis", arguments: { period: "1m" } },
      { name: "prepare-coach-report", arguments: { recipient: "sports physician" } },
    ];

    for (let i = 0; i < promptCases.length; i++) {
      const p = promptCases[i];
      const res = await rpc(fullReadToken, 200 + i, "prompts/get", p);
      expect(res.status).toBe(200);
      const result = res.payload.result as {
        messages: Array<{ role: string; content: { type: string; text: string } }>;
      };
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0].content.text.length).toBeGreaterThan(20);
    }
  });

  it("enforces granular scopes and strict cross-user isolation", async () => {
    // 1. profile:read only token
    const profileToolsRes = await rpc(profileOnlyToken, 301, "tools/list");
    const profileTools = (
      profileToolsRes.payload.result as { tools: Array<{ name: string }> }
    ).tools.map((t) => t.name);
    expect(profileTools.sort()).toEqual(["about", "get_user_profile"]);

    const profileResList = await rpc(profileOnlyToken, 302, "resources/list");
    const profileResources = (
      profileResList.payload.result as { resources: Array<{ uri: string }> }
    ).resources.map((r) => r.uri);
    expect(profileResources).toEqual(["recomp://profile"]);

    // Attempt to invoke an out-of-scope tool
    const deniedToolRes = await rpc(profileOnlyToken, 303, "tools/call", {
      name: "list_biometric_records",
      arguments: {},
    });
    const deniedIsError =
      Boolean(deniedToolRes.payload.error) ||
      Boolean((deniedToolRes.payload.result as { isError?: boolean } | undefined)?.isError);
    expect(deniedIsError).toBe(true);

    // 2. biometrics:read only token (should NOT expose recomp-progress-review which requires workouts:read too)
    const bioPromptsRes = await rpc(biometricsOnlyToken, 304, "prompts/list");
    const bioPrompts = (
      bioPromptsRes.payload.result as { prompts: Array<{ name: string }> }
    ).prompts.map((p) => p.name);
    expect(bioPrompts.sort()).toEqual([
      "biometrics-segmental-analysis",
      "prepare-coach-report",
    ]);

    // 3. Cross-user isolation: user2 cannot read user1's record, workout, or shared link
    const otherRecordRes = await rpc(otherUserToken, 305, "tools/call", {
      name: "get_biometric_record",
      arguments: { record_id: starredRecordId },
    });
    expect((otherRecordRes.payload.result as { isError?: boolean }).isError).toBe(true);

    const otherWorkoutRes = await rpc(otherUserToken, 306, "tools/call", {
      name: "get_workout_details",
      arguments: { workout_id: workoutId2 },
    });
    expect((otherWorkoutRes.payload.result as { isError?: boolean }).isError).toBe(true);

    const otherLinkRes = await rpc(otherUserToken, 307, "tools/call", {
      name: "get_shared_link_details",
      arguments: { link_id: sharedLinkId },
    });
    expect((otherLinkRes.payload.result as { isError?: boolean }).isError).toBe(true);
  });
});
