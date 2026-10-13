import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { ensureTablesExist } from "@/db/initDb";
import { POST as connectHevy } from "@/app/api/integrations/hevy/connect/route";
import { GET as getHevyStatus, DELETE as disconnectHevy } from "@/app/api/integrations/hevy/route";
import { POST as syncHevy } from "@/app/api/integrations/hevy/sync/route";
import { POST as regenerateWebhook } from "@/app/api/integrations/hevy/regenerate-webhook/route";
import { POST as hevyWebhook } from "@/app/api/integrations/hevy/webhook/[token]/route";
import { GET as getWorkouts } from "@/app/api/workouts/route";
import { GET as getWorkoutDetails } from "@/app/api/workouts/[id]/route";
import { GET as getReadiness } from "@/app/api/workouts/readiness/route";
import { GET as getWorkoutStats } from "@/app/api/workouts/stats/route";
import { db } from "@/db/client";
import { users, userIntegrations, workouts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createAccessToken } from "@/lib/auth";

// Mock HevyClient
vi.mock("@/lib/hevy/client", () => {
  return {
    HevyClient: class {
      apiKey: string;
      constructor(opts: { apiKey: string }) {
        this.apiKey = opts.apiKey;
      }
      getUserInfo = vi.fn().mockImplementation(async () => {
        if (this.apiKey === "invalid_key") {
          const err = new Error("Invalid API key") as Error & { status: number };
          err.status = 401;
          throw err;
        }
        return { id: "hevy-user-999", username: "champion_lifter" };
      });
      getExerciseTemplates = vi.fn().mockResolvedValue({
        page: 1,
        page_count: 1,
        exercise_templates: [
          {
            id: "tpl-bench",
            title: "Bench Press (Barbell)",
            primary_muscle_group: "chest",
            equipment: "barbell",
            is_custom: false,
          },
          {
            id: "tpl-squat",
            title: "Squat (Barbell)",
            primary_muscle_group: "quadriceps",
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
            id: "hevy-w-1",
            title: "Push Day",
            description: "Heavy bench session",
            start_time: "2026-10-12T10:00:00Z",
            end_time: "2026-10-12T11:00:00Z",
            created_at: "2026-10-12T11:00:00Z",
            updated_at: "2026-10-12T11:00:00Z",
            routine_id: null,
            exercises: [
              {
                index: 0,
                title: "Bench Press (Barbell)",
                exercise_template_id: "tpl-bench",
                sets: [
                  {
                    index: 0,
                    type: "normal",
                    weight_kg: 80,
                    reps: 10,
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
      getWorkout = vi.fn().mockResolvedValue({
        id: "hevy-w-2",
        title: "Leg Day",
        description: "Squat PR",
        start_time: "2026-10-13T09:00:00Z",
        end_time: "2026-10-13T10:00:00Z",
        created_at: "2026-10-13T10:00:00Z",
        updated_at: "2026-10-13T10:00:00Z",
        routine_id: null,
        exercises: [
          {
            index: 0,
            title: "Squat (Barbell)",
            exercise_template_id: "tpl-squat",
            sets: [
              {
                index: 0,
                type: "normal",
                weight_kg: 120,
                reps: 8,
                rpe: 9,
                duration_seconds: null,
                distance_meters: null,
                custom_metric: null,
              },
            ],
          },
        ],
      });
    },
    HevyApiError: class extends Error {
      status: number;
      constructor(msg: string, status: number) {
        super(msg);
        this.status = status;
      }
    },
  };
});

describe("Hevy Integration & Workouts API Routes", () => {
  let testUserId: number;
  let authToken: string;

  beforeAll(async () => {
    await ensureTablesExist();

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, "hevy_test_user@example.com"),
    });

    if (existingUser) {
      testUserId = existingUser.id;
      await db.update(users).set({ emailConfirmed: true }).where(eq(users.id, testUserId));
    } else {
      const inserted = await db
        .insert(users)
        .values({
          email: "hevy_test_user@example.com",
          hashedPassword: "hashed_test_password",
          displayName: "Hevy Test User",
          gender: "male",
          birthday: "1992-05-15",
          targetWeightKg: 80,
          emailConfirmed: true,
        })
        .returning({ id: users.id });
      testUserId = inserted[0].id;
    }

    authToken = await createAccessToken({ sub: "hevy_test_user@example.com", email: "hevy_test_user@example.com" });
  });

  beforeEach(async () => {
    await db.delete(userIntegrations).where(eq(userIntegrations.userId, testUserId));
    await db.delete(workouts).where(eq(workouts.userId, testUserId));
  });

  it("should connect Hevy integration with valid API key", async () => {
    const req = new NextRequest("http://localhost/api/integrations/hevy/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ apiKey: "valid_hevy_api_key" }),
    });

    const res = await connectHevy(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.accountIdentifier).toBe("champion_lifter");
    expect(json.webhookToken).toBeTruthy();
    expect(json.webhookPath).toContain(json.webhookToken);

    // Verify record in DB
    const stored = await db.query.userIntegrations.findFirst({
      where: eq(userIntegrations.userId, testUserId),
    });
    expect(stored).toBeTruthy();
    expect(stored?.provider).toBe("hevy");
    expect(stored?.status).toBe("connected");
  });

  it("should return 401 when connecting with invalid API key", async () => {
    const req = new NextRequest("http://localhost/api/integrations/hevy/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ apiKey: "invalid_key" }),
    });

    const res = await connectHevy(req);
    expect(res.status).toBe(401);
  });

  it("should retrieve status and sync workouts", async () => {
    // 1. Connect
    const connectReq = new NextRequest("http://localhost/api/integrations/hevy/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ apiKey: "valid_hevy_api_key" }),
    });
    await connectHevy(connectReq);

    // 2. Status
    const statusReq = new NextRequest("http://localhost/api/integrations/hevy", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const statusRes = await getHevyStatus(statusReq);
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json();
    expect(statusJson.connected).toBe(true);

    // 3. Sync
    const syncReq = new NextRequest("http://localhost/api/integrations/hevy/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ forceFull: true }),
    });
    const syncRes = await syncHevy(syncReq);
    expect(syncRes.status).toBe(200);
    const syncJson = await syncRes.json();
    expect(syncJson.success).toBe(true);
    expect(syncJson.total).toBe(1);
    expect(syncJson.syncedWorkouts).toBe(1);
    expect(syncJson.totalWorkouts).toBe(1);

    // 4. Verify Workouts in DB
    const listReq = new NextRequest("http://localhost/api/workouts", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const listRes = await getWorkouts(listReq);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.total).toBe(1);
    expect(listJson.workouts[0].title).toBe("Push Day");
    expect(listJson.workouts[0].totalCaloriesBurned).toBeGreaterThan(0);
    expect(listJson.workouts[0].sessionCaloriesBurned).toBeGreaterThan(0);
    expect(listJson.workouts[0].epocCaloriesBurned).toBeGreaterThan(0);
  });

  it("should handle incoming webhook to create and delete workout", async () => {
    // Connect to obtain webhook token
    const connectReq = new NextRequest("http://localhost/api/integrations/hevy/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ apiKey: "valid_hevy_api_key" }),
    });
    const connectRes = await connectHevy(connectReq);
    const { webhookToken } = await connectRes.json();

    // Fire webhook WORKOUT_CREATED
    const webhookReq = new NextRequest(
      `http://localhost/api/integrations/hevy/webhook/${webhookToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "WORKOUT_CREATED",
          id: "hevy-w-2",
        }),
      }
    );
    const webhookRes = await hevyWebhook(webhookReq, {
      params: Promise.resolve({ token: webhookToken }),
    });
    expect(webhookRes.status).toBe(200);
    const webhookJson = await webhookRes.json();
    expect(webhookJson.success).toBe(true);

    // Check workout details
    const detailReq = new NextRequest("http://localhost/api/workouts/hevy-w-2", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const detailRes = await getWorkoutDetails(detailReq, {
      params: Promise.resolve({ id: "hevy-w-2" }),
    });
    expect(detailRes.status).toBe(200);
    const detailJson = await detailRes.json();
    expect(detailJson.title).toBe("Leg Day");
    expect(detailJson.exercises[0].title).toBe("Squat (Barbell)");

    // Fire webhook WORKOUT_DELETED
    const deleteWebhookReq = new NextRequest(
      `http://localhost/api/integrations/hevy/webhook/${webhookToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "WORKOUT_DELETED",
          id: "hevy-w-2",
        }),
      }
    );
    const deleteWebhookRes = await hevyWebhook(deleteWebhookReq, {
      params: Promise.resolve({ token: webhookToken }),
    });
    expect(deleteWebhookRes.status).toBe(200);

    // Verify deleted
    const checkDeletedRes = await getWorkoutDetails(detailReq, {
      params: Promise.resolve({ id: "hevy-w-2" }),
    });
    expect(checkDeletedRes.status).toBe(404);
  });

  it("should compute muscle readiness status", async () => {
    // Connect & sync workout
    const connectReq = new NextRequest("http://localhost/api/integrations/hevy/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ apiKey: "valid_hevy_api_key" }),
    });
    await connectHevy(connectReq);

    const syncReq = new NextRequest("http://localhost/api/integrations/hevy/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ forceFull: true }),
    });
    await syncHevy(syncReq);

    const readinessReq = new NextRequest("http://localhost/api/workouts/readiness", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const readinessRes = await getReadiness(readinessReq);
    expect(readinessRes.status).toBe(200);

    const readinessJson = await readinessRes.json();
    expect(readinessJson.muscleGroups).toBeTruthy();
    expect(readinessJson.muscleGroups.length).toBeGreaterThan(0);
    expect(readinessJson.muscles).toBeTruthy();
    expect(readinessJson.muscles.chest).toBeTruthy();
    expect(readinessJson.muscles.quads).toBeTruthy();
    expect(readinessJson.overallReadiness).toBeTruthy();
    expect(readinessJson.smartRecommendation).toBeTruthy();
    expect(readinessJson.userProfile).toBeTruthy();
  });

  it("should compute workout stats and calendar days", async () => {
    // 1. Connect & Sync
    const connectReq = new NextRequest("http://localhost/api/integrations/hevy/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ apiKey: "valid_hevy_api_key" }),
    });
    await connectHevy(connectReq);

    const syncReq = new NextRequest("http://localhost/api/integrations/hevy/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ forceFull: true }),
    });
    await syncHevy(syncReq);

    const statsReq = new NextRequest("http://localhost/api/workouts/stats?period=3m", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const statsRes = await getWorkoutStats(statsReq);
    expect(statsRes.status).toBe(200);

    const statsJson = await statsRes.json();
    expect(statsJson.period).toBe("3m");
    expect(statsJson.summary).toBeTruthy();
    expect(statsJson.summary.totalWorkouts).toBe(1);
    expect(statsJson.chartData).toBeTruthy();
    expect(statsJson.chartData.length).toBe(12);
    expect(statsJson.calendarDays).toBeTruthy();
  });

  it("should regenerate webhook token", async () => {
    const connectReq = new NextRequest("http://localhost/api/integrations/hevy/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ apiKey: "valid_hevy_api_key" }),
    });
    const connectRes = await connectHevy(connectReq);
    const { webhookToken: originalToken } = await connectRes.json();

    const regenReq = new NextRequest(
      "http://localhost/api/integrations/hevy/regenerate-webhook",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    const regenRes = await regenerateWebhook(regenReq);
    expect(regenRes.status).toBe(200);
    const regenJson = await regenRes.json();
    expect(regenJson.webhookToken).not.toBe(originalToken);
  });

  it("should disconnect and purge data when deleteData is true", async () => {
    const connectReq = new NextRequest("http://localhost/api/integrations/hevy/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ apiKey: "valid_hevy_api_key" }),
    });
    await connectHevy(connectReq);

    const syncReq = new NextRequest("http://localhost/api/integrations/hevy/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ forceFull: true }),
    });
    await syncHevy(syncReq);

    const discReq = new NextRequest("http://localhost/api/integrations/hevy?deleteData=true", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const discRes = await disconnectHevy(discReq);
    expect(discRes.status).toBe(200);

    // Verify integration revoked
    const checkStatus = await getHevyStatus(
      new NextRequest("http://localhost/api/integrations/hevy", {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    const statusJson = await checkStatus.json();
    expect(statusJson.connected).toBe(false);

    // Verify workouts purged
    const listRes = await getWorkouts(
      new NextRequest("http://localhost/api/workouts", {
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    const listJson = await listRes.json();
    expect(listJson.total).toBe(0);
  });
});
