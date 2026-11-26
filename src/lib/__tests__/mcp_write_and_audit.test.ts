import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/db/client";
import {
  mcpAuditLogs,
  mcpOauthAuthCodes,
  mcpOauthClients,
  mcpOauthGrants,
  mcpOauthTokens,
  recompRecords,
  sharedLinks,
  userIntegrations,
  users,
} from "@/db/schema";
import { ensureTablesExist } from "@/db/initDb";
import { desc, eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { createPersonalAccessToken } from "@/lib/mcp/oauth/tokens";
import {
  pruneExpiredOauthArtifacts,
  pruneMcpAuditLogsForUser,
} from "@/lib/mcp/audit";
import { POST as mcpPost } from "@/app/mcp/route";

vi.mock("@/lib/fitdays/client", () => {
  return {
    RecompFitdaysClient: class {
      baseUrl = "https://online-us.fitdays.cn";
      country = "US";
      session = { token: "mock-token", uid: 101, refreshToken: "mock-refresh" };

      syncAll = vi.fn().mockResolvedValue({
        code: 200,
        data: {
          weight_list: [
            {
              measured_time: 1718500000,
              suid: 1001,
              is_deleted: 0,
              weight_g: 73500,
              bmi: 22.9,
              bfr: 16.8,
              vwc: 59.2,
              rosm: 44.1,
              rom: 78.2,
              bm: 3.2,
              sfr: 13.5,
              uvi: 6,
              pp: 19.2,
              bmr: 1690,
              bodyage: 26,
              hr: 61,
              adc: 505,
              ext_data: { onlyMeasureWeight: "0" },
            },
          ],
        },
      });

      syncIncrements = vi.fn().mockResolvedValue({
        code: 200,
        data: { weight_list: [] },
      });

      loginWithPasswordHash = vi.fn().mockResolvedValue({
        token: "refreshed",
        uid: 101,
        refreshToken: "refreshed-rt",
      });
    },
  };
});

vi.mock("@/lib/hevy/client", () => {
  return {
    HevyClient: class {
      getExerciseTemplates = vi.fn().mockResolvedValue({
        page: 1,
        page_count: 1,
        exercise_templates: [
          {
            id: "tpl-mcp-write-bench",
            title: "Bench Press (Barbell)",
            primary_muscle_group: "chest",
            equipment: "barbell",
            is_custom: false,
          },
        ],
      });

      getWorkouts = vi.fn().mockResolvedValue({
        page: 1,
        page_count: 1,
        workouts: [
          {
            id: "hevy-mcp-write-w1",
            title: "MCP Synced Push",
            description: "Synced via MCP tool",
            start_time: "2026-11-20T10:00:00Z",
            end_time: "2026-11-20T11:00:00Z",
            created_at: "2026-11-20T11:00:00Z",
            updated_at: "2026-11-20T11:00:00Z",
            routine_id: null,
            exercises: [
              {
                index: 0,
                title: "Bench Press (Barbell)",
                exercise_template_id: "tpl-mcp-write-bench",
                sets: [
                  {
                    index: 0,
                    type: "normal",
                    weight_kg: 85,
                    reps: 8,
                    rpe: 8,
                    duration_seconds: null,
                    distance_meters: null,
                    custom_metric: null,
                  },
                ],
              },
            ],
          },
        ],
      });
    },
  };
});

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

describe("MCP Phase 3: Write Primitives, Audit Logging & Retention Pruning", () => {
  const origMaxPerUser = process.env.MCP_AUDIT_LOG_MAX_PER_USER;
  const origRetentionDays = process.env.MCP_AUDIT_LOG_RETENTION_DAYS;

  let user1Id = 0;
  let user1Email = "";
  let readOnlyToken = "";
  let readWriteToken = "";
  let user1Record1Id = 0;
  let user1Record2Id = 0;
  let user2RecordId = 0;
  let autoShareLinkId = "";

  beforeAll(async () => {
    await ensureTablesExist();
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const hashedPassword = await hashPassword("StrongPass123!");
    user1Email = `mcp_write_u1_${suffix}@example.com`;

    const [u1] = await db
      .insert(users)
      .values({
        email: user1Email,
        hashedPassword,
        displayName: "Writer One",
        gender: "male",
        birthday: "1990-01-01",
        heightCm: 178,
        targetWeightKg: 74,
        profileImagePath: "/app/data/profile_pics/hidden.png",
        preferredLanguage: "en",
        emailConfirmed: true,
      })
      .returning();
    user1Id = u1.id;

    const [u2] = await db
      .insert(users)
      .values({
        email: `mcp_write_u2_${suffix}@example.com`,
        hashedPassword,
        displayName: "User Two",
        emailConfirmed: true,
        preferredLanguage: "en",
      })
      .returning();

    readOnlyToken = (
      await createPersonalAccessToken({
        userId: user1Id,
        name: "ReadOnly Agent",
        scopes: ["recomp:read"],
      })
    ).token;

    readWriteToken = (
      await createPersonalAccessToken({
        userId: user1Id,
        name: "ReadWrite Agent",
        scopes: ["recomp:read", "recomp:write"],
      })
    ).token;

    const makeRecord = (userId: number, date: Date, weight: number) => ({
      userId,
      date,
      starred: false,
      weight,
      bmi: 23.2,
      bodyFatPct: 17.0,
      subcutaneousFatPct: 14.0,
      visceralFat: 6,
      bodyWaterPct: 58.0,
      skeletalMuscleMassPct: 45.0,
      muscleMass: 58.0,
      boneMass: 3.2,
      proteinPct: 18.5,
      bmr: 1650,
      metabolicAge: 28,
      fatMass: 12.8,
      moistureContent: 43.5,
      skeletalMuscleMass: 33.8,
      muscleRatePct: 77.0,
      proteinMass: 13.9,
      obesityScore: 0,
      fatFreeMass: 62.2,
      smi: 8.2,
      bodyScore: 86,
      targetWeight: 74.0,
      weightControl: -1.0,
      fatControl: -1.0,
      muscleControl: 0.0,
    });

    const [r1] = await db
      .insert(recompRecords)
      .values(makeRecord(user1Id, new Date("2026-10-01T08:00:00Z"), 75.5))
      .returning();
    const [r2] = await db
      .insert(recompRecords)
      .values(makeRecord(user1Id, new Date("2026-10-10T08:00:00Z"), 75.0))
      .returning();
    const [rU2] = await db
      .insert(recompRecords)
      .values(makeRecord(u2.id, new Date("2026-10-12T08:00:00Z"), 82.0))
      .returning();

    user1Record1Id = r1.id;
    user1Record2Id = r2.id;
    user2RecordId = rU2.id;

    // Seed an auto_share_starred shared link for user1
    autoShareLinkId = `auto-link-${suffix}`;
    await db.insert(sharedLinks).values({
      id: autoShareLinkId,
      ownerId: user1Id,
      token: `tok-auto-${suffix}`,
      description: "Auto-share starred scans",
      includeAttachments: true,
      autoShareStarred: true,
      manualEntryIds: JSON.stringify([]),
      snapshotData: JSON.stringify([]),
    });

    // Seed Fitdays and Hevy integrations for user1
    await db.insert(userIntegrations).values([
      {
        userId: user1Id,
        provider: "fitdays",
        accountIdentifier: "fitdays@example.com",
        encryptedCredentials: encryptJson({
          email: "fitdays@example.com",
          passwordHash: "HASH",
          token: "tok",
          uid: 101,
        }),
        configJson: JSON.stringify({
          selectedSuid: 1001,
          skipWeightOnly: true,
        }),
        status: "connected",
      },
      {
        userId: user1Id,
        provider: "hevy",
        accountIdentifier: "hevy_writer",
        encryptedCredentials: encryptJson({
          apiKey: "valid_hevy_key",
        }),
        configJson: JSON.stringify({
          webhookToken: "wh-secret",
        }),
        status: "connected",
      },
    ]);
  });

  afterEach(() => {
    if (origMaxPerUser === undefined) {
      delete process.env.MCP_AUDIT_LOG_MAX_PER_USER;
    } else {
      process.env.MCP_AUDIT_LOG_MAX_PER_USER = origMaxPerUser;
    }
    if (origRetentionDays === undefined) {
      delete process.env.MCP_AUDIT_LOG_RETENTION_DAYS;
    } else {
      process.env.MCP_AUDIT_LOG_RETENTION_DAYS = origRetentionDays;
    }
  });

  it("hides write tools from Read-Only tokens and logs denied attempts in mcp_audit_logs", async () => {
    const listRes = await rpc(readOnlyToken, 1, "tools/list");
    const toolNames = (
      listRes.payload.result as { tools: Array<{ name: string }> }
    ).tools.map((t) => t.name);

    expect(toolNames).not.toContain("update_user_profile");
    expect(toolNames).not.toContain("delete_biometric_records");
    expect(toolNames).not.toContain("create_shared_link");
    expect(toolNames).not.toContain("trigger_fitdays_sync");

    const deniedRes = await rpc(readOnlyToken, 2, "tools/call", {
      name: "update_user_profile",
      arguments: { display_name: "Hacker" },
    });
    const isDenied =
      Boolean(deniedRes.payload.error) ||
      Boolean((deniedRes.payload.result as { isError?: boolean } | undefined)?.isError);
    expect(isDenied).toBe(true);

    const logs = await db.query.mcpAuditLogs.findMany({
      where: eq(mcpAuditLogs.userId, user1Id),
      orderBy: [desc(mcpAuditLogs.id)],
    });
    const deniedLog = logs.find(
      (l) => l.primitiveName === "update_user_profile" && l.status === "denied"
    );
    expect(deniedLog).toBeDefined();
    expect(deniedLog?.errorCode).toBe("INSUFFICIENT_SCOPE");
    expect(deniedLog?.accessMode).toBe("write");
    expect(deniedLog?.clientLabel).toBe("ReadOnly Agent");
  });

  it("executes all 8 write tools with Read+Write token and enforces safety boundaries", async () => {
    const listRes = await rpc(readWriteToken, 10, "tools/list");
    const tools = (
      listRes.payload.result as {
        tools: Array<{
          name: string;
          annotations?: {
            readOnlyHint?: boolean;
            destructiveHint?: boolean;
            openWorldHint?: boolean;
          };
        }>;
      }
    ).tools;
    expect(tools).toHaveLength(21);

    // 1. update_user_profile (and ensure email cannot be altered)
    const profRes = await rpc(readWriteToken, 11, "tools/call", {
      name: "update_user_profile",
      arguments: {
        display_name: "Writer Updated",
        target_weight_kg: 72.5,
        email: "attacker@example.com",
      },
    });
    const prof = parseToolJson(profRes.payload);
    expect(prof.display_name).toBe("Writer Updated");
    expect(prof.target_weight_kg).toBe(72.5);
    expect(prof.profile_image_path).toBeUndefined();

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user1Id),
    });
    expect(dbUser?.email).toBe(user1Email);
    expect(dbUser?.pendingEmail).toBeNull();

    // 2. toggle_biometric_record_star + auto_share_starred sync
    const starRes = await rpc(readWriteToken, 12, "tools/call", {
      name: "toggle_biometric_record_star",
      arguments: { record_id: user1Record1Id, starred: true },
    });
    const starJson = parseToolJson(starRes.payload);
    expect(starJson.success).toBe(true);
    expect(starJson.starred).toBe(true);

    const updatedLink = await db.query.sharedLinks.findFirst({
      where: eq(sharedLinks.id, autoShareLinkId),
    });
    const snapshot = JSON.parse(updatedLink?.snapshotData || "[]") as Array<{ id: number }>;
    expect(snapshot.map((s) => s.id)).toContain(user1Record1Id);

    // 3. delete_biometric_records (owned deleted, other user's record unauthorized)
    const delRes = await rpc(readWriteToken, 13, "tools/call", {
      name: "delete_biometric_records",
      arguments: { record_ids: [user1Record2Id, user2RecordId] },
    });
    const delJson = parseToolJson(delRes.payload) as {
      deleted: number[];
      failed: Array<{ id: number; reason: string }>;
    };
    expect(delJson.deleted).toEqual([user1Record2Id]);
    expect(delJson.failed).toEqual([{ id: user2RecordId, reason: "unauthorized" }]);

    // 4. trigger_fitdays_sync & trigger_hevy_sync
    const fitRes = await rpc(readWriteToken, 14, "tools/call", {
      name: "trigger_fitdays_sync",
      arguments: { force_full: true },
    });
    const fitJson = parseToolJson(fitRes.payload) as {
      success: boolean;
      result: { inserted: number };
    };
    expect(fitJson.success).toBe(true);
    expect(fitJson.result.inserted).toBe(1);

    const hevyRes = await rpc(readWriteToken, 15, "tools/call", {
      name: "trigger_hevy_sync",
      arguments: { force_full: true, page_size: 5 },
    });
    const hevyJson = parseToolJson(hevyRes.payload) as {
      success: boolean;
      syncedWorkouts: number;
    };
    expect(hevyJson.success).toBe(true);
    expect(hevyJson.syncedWorkouts).toBe(1);

    // 5. create_shared_link -> update_shared_link -> delete_shared_link
    const createLinkRes = await rpc(readWriteToken, 16, "tools/call", {
      name: "create_shared_link",
      arguments: {
        description: "MCP Created Report",
        entry_ids: [user1Record1Id],
      },
    });
    const createdLink = parseToolJson(createLinkRes.payload) as {
      id: string;
      description: string;
      share_url: string;
    };
    expect(createdLink.description).toBe("MCP Created Report");
    expect(createdLink.share_url).toContain("https://recomp.example.com/shared/");

    const updateLinkRes = await rpc(readWriteToken, 17, "tools/call", {
      name: "update_shared_link",
      arguments: {
        link_id: createdLink.id,
        description: "MCP Updated Report",
        auto_share_starred: true,
      },
    });
    const patchedLink = parseToolJson(updateLinkRes.payload) as {
      description: string;
      auto_share_starred: boolean;
    };
    expect(patchedLink.description).toBe("MCP Updated Report");
    expect(patchedLink.auto_share_starred).toBe(true);

    const deleteLinkRes = await rpc(readWriteToken, 18, "tools/call", {
      name: "delete_shared_link",
      arguments: { link_id: createdLink.id },
    });
    const deletedLink = parseToolJson(deleteLinkRes.payload) as {
      success: boolean;
      deleted_id: string;
    };
    expect(deletedLink.success).toBe(true);
    expect(deletedLink.deleted_id).toBe(createdLink.id);

    // 6. Trigger a ServiceError and verify sanitized error audit log
    const errRes = await rpc(readWriteToken, 19, "tools/call", {
      name: "get_biometric_record",
      arguments: { record_id: 99999999 },
    });
    expect((errRes.payload.result as { isError?: boolean }).isError).toBe(true);

    const logs = await db.query.mcpAuditLogs.findMany({
      where: eq(mcpAuditLogs.userId, user1Id),
      orderBy: [desc(mcpAuditLogs.id)],
    });
    expect(logs.some((l) => l.primitiveName === "create_shared_link" && l.status === "success" && l.accessMode === "write")).toBe(true);
    expect(logs.some((l) => l.primitiveName === "get_biometric_record" && l.status === "error" && l.errorCode === "RECORD_NOT_FOUND")).toBe(true);
  });

  it("enforces audit log max-per-user cap, age retention, and expired OAuth pruning", async () => {
    process.env.MCP_AUDIT_LOG_MAX_PER_USER = "3";
    process.env.MCP_AUDIT_LOG_RETENTION_DAYS = "7";

    // Insert an old audit log (> 7 days) directly and invoke prune
    await db.insert(mcpAuditLogs).values({
      userId: user1Id,
      authMethod: "pat",
      clientLabel: "Old Client",
      primitiveType: "tool",
      primitiveName: "about",
      accessMode: "read",
      status: "success",
      durationMs: 1,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    // Make 4 fresh calls -> cap should keep strictly 3 rows for user1
    for (let i = 0; i < 4; i++) {
      await rpc(readOnlyToken, 50 + i, "tools/call", {
        name: "about",
        arguments: {},
      });
    }

    const prunedResult = await pruneMcpAuditLogsForUser(user1Id);
    expect(prunedResult.deletedByAge).toBe(0); // already pruned during recordMcpAuditLog
    expect(prunedResult.deletedByCap).toBe(0);

    const remainingLogs = await db.query.mcpAuditLogs.findMany({
      where: eq(mcpAuditLogs.userId, user1Id),
    });
    expect(remainingLogs).toHaveLength(3);

    // Seed expired OAuth auth code, expired token, active token, stale DCR client, active DCR client
    const staleClientId = `recomp_client_stale_${Date.now()}`;
    const activeClientId = `recomp_client_active_${Date.now()}`;
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const futureDate = new Date(Date.now() + 3600 * 1000);
    const pastDate = new Date(Date.now() - 3600 * 1000);

    await db.insert(mcpOauthClients).values([
      {
        clientId: staleClientId,
        registrationType: "dcr",
        clientName: "Stale DCR",
        redirectUrisJson: "[]",
        createdAt: oldDate,
      },
      {
        clientId: activeClientId,
        registrationType: "dcr",
        clientName: "Active DCR",
        redirectUrisJson: "[]",
        createdAt: oldDate,
      },
    ]);

    const grantId = `grant-prune-${Date.now()}`;
    await db.insert(mcpOauthGrants).values({
      id: grantId,
      userId: user1Id,
      clientId: activeClientId,
      grantedScopes: "recomp:read",
    });

    await db.insert(mcpOauthAuthCodes).values({
      codeHash: `expired_code_${Date.now()}`,
      clientId: activeClientId,
      userId: user1Id,
      redirectUri: "http://127.0.0.1/cb",
      scope: "recomp:read",
      codeChallenge: "abc",
      codeChallengeMethod: "S256",
      expiresAt: pastDate,
    });

    await db.insert(mcpOauthTokens).values([
      {
        grantId,
        userId: user1Id,
        clientId: activeClientId,
        tokenType: "access",
        tokenHash: `expired_tok_${Date.now()}`,
        familyId: "fam-1",
        scope: "recomp:read",
        expiresAt: pastDate,
      },
      {
        grantId,
        userId: user1Id,
        clientId: activeClientId,
        tokenType: "access",
        tokenHash: `valid_tok_${Date.now()}`,
        familyId: "fam-2",
        scope: "recomp:read",
        expiresAt: futureDate,
      },
    ]);

    const oauthPrune = await pruneExpiredOauthArtifacts();
    expect(oauthPrune.deletedAuthCodes).toBeGreaterThanOrEqual(1);
    expect(oauthPrune.deletedTokens).toBeGreaterThanOrEqual(1);
    expect(oauthPrune.deletedStaleDcrClients).toBeGreaterThanOrEqual(1);

    const staleCheck = await db.query.mcpOauthClients.findFirst({
      where: eq(mcpOauthClients.clientId, staleClientId),
    });
    const activeCheck = await db.query.mcpOauthClients.findFirst({
      where: eq(mcpOauthClients.clientId, activeClientId),
    });
    expect(staleCheck).toBeUndefined();
    expect(activeCheck).toBeDefined();
  });
});
