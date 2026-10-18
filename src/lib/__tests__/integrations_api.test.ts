import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { ensureTablesExist } from "@/db/initDb";
import { GET as getIntegrations } from "@/app/api/integrations/route";
import { POST as connectFitdays } from "@/app/api/integrations/fitdays/connect/route";
import { POST as selectProfile } from "@/app/api/integrations/fitdays/select-profile/route";
import { POST as syncFitdays } from "@/app/api/integrations/fitdays/sync/route";
import { DELETE as disconnectFitdays, PATCH as patchFitdaysConfig } from "@/app/api/integrations/fitdays/route";
import { db } from "@/db/client";
import { users, userIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptJson } from "@/lib/crypto";
import { createAccessToken } from "@/lib/auth";

// Mock RecompFitdaysClient
vi.mock("@/lib/fitdays/client", () => {
  return {
    RecompFitdaysClient: class {
      baseUrl = "https://online-us.fitdays.cn";
      country = "US";
      session = { token: "mock-token", uid: 101, refreshToken: "mock-refresh" };

      loginWithPlainPassword = vi.fn().mockResolvedValue({
        session: { token: "mock-token", uid: 101, refreshToken: "mock-refresh" },
        passwordHash: "MOCK_MD5_HASH",
      });

      loginWithPasswordHash = vi.fn().mockResolvedValue({
        token: "refreshed-token",
        uid: 101,
        refreshToken: "refreshed-refresh",
      });

      syncFromServer = vi.fn().mockResolvedValue({
        code: 200,
        data: {
          account: { active_suid: 1001 },
          users: [
            {
              suid: 1001,
              nickname: "Test User",
              height: 175,
              birthday: "1990-01-01",
              target_weight: 70,
              is_deleted: 0,
              sex: 1,
            },
            {
              suid: 1002,
              nickname: "Family Member",
              height: 165,
              birthday: "1992-05-10",
              target_weight: 60,
              is_deleted: 0,
              sex: 0,
            },
          ],
          devices: [
            { name: "My Fitdays Scale", model: "CF516", mac: "AA:BB:CC:DD:EE:FF" },
          ],
        },
      });

      syncAll = vi.fn().mockResolvedValue({
        code: 200,
        data: {
          weight_list: [
            {
              measured_time: 1718000000,
              suid: 1001,
              is_deleted: 0,
              weight_g: 72000,
              bmi: 23.5,
              bfr: 18.0,
              vwc: 58.0,
              rosm: 42.0,
              rom: 78.0,
              bm: 3.1,
              sfr: 14.0,
              uvi: 6,
              pp: 19.0,
              bmr: 1700,
              bodyage: 26,
              hr: 62,
              adc: 510,
              ext_data: { onlyMeasureWeight: "0" },
            },
          ],
        },
      });

      syncIncrements = vi.fn().mockResolvedValue({
        code: 200,
        data: {
          weight_list: [],
        },
      });
    },
  };
});

describe("Integrations API Routes", () => {
  let testUserId: number;
  let authToken: string;

  beforeAll(async () => {
    await ensureTablesExist();
  });

  beforeEach(async () => {
    // Clean test integrations
    await db.delete(userIntegrations);
    await db.delete(users);

    // Insert mock user
    const [insertedUser] = await db
      .insert(users)
      .values({
        email: "integration_test@example.com",
        hashedPassword: "hashed_test_password",
        emailConfirmed: true,
        createdAt: new Date(),
      })
      .returning();

    testUserId = insertedUser.id;
    authToken = await createAccessToken({
      sub: "integration_test@example.com",
      userId: testUserId,
      email: "integration_test@example.com",
    });
  });

  it("should return empty list when no integrations are configured", async () => {
    const req = new NextRequest("http://localhost/api/integrations", {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const res = await getIntegrations(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it("should connect Fitdays account, encrypt credentials, and discover profiles", async () => {
    const req = new NextRequest("http://localhost/api/integrations/fitdays/connect", {
      method: "POST",
      body: JSON.stringify({
        email: "fitdays@example.com",
        password: "secret_password",
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });

    const res = await connectFitdays(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.profiles).toHaveLength(2);
    expect(json.profiles[0].nickname).toBe("Test User");
    expect(json.devices).toHaveLength(1);

    // Verify stored in DB with encryption
    const stored = await db.query.userIntegrations.findFirst({
      where: eq(userIntegrations.userId, testUserId),
    });
    expect(stored).toBeDefined();
    expect(stored?.accountIdentifier).toBe("fitdays@example.com");
    expect(stored?.encryptedCredentials).toContain('"v":1');
    expect(stored?.encryptedCredentials).not.toContain("secret_password");
  });

  it("should select member profile and perform initial sync", async () => {
    // Setup existing integration
    await db.insert(userIntegrations).values({
      userId: testUserId,
      provider: "fitdays",
      accountIdentifier: "fitdays@example.com",
      encryptedCredentials: encryptJson({
        email: "fitdays@example.com",
        passwordHash: "HASH",
        token: "tok",
        uid: 101,
      }),
      configJson: JSON.stringify({
        profiles: [{ suid: 1001, nickname: "Test User" }],
        devices: [],
        skipWeightOnly: true,
      }),
      status: "connected",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest("http://localhost/api/integrations/fitdays/select-profile", {
      method: "POST",
      body: JSON.stringify({
        suid: 1001,
        syncNow: true,
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });

    const res = await selectProfile(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.selectedSuid).toBe(1001);
    expect(json.result.inserted).toBe(1);
  });

  it("should trigger incremental sync and update lastSyncedAt", async () => {
    await db.insert(userIntegrations).values({
      userId: testUserId,
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
      lastSyncedAt: new Date(Date.now() - 3600000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest("http://localhost/api/integrations/fitdays/sync", {
      method: "POST",
      body: JSON.stringify({ forceFull: false }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });

    const res = await syncFitdays(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.lastSyncedAt).toBeDefined();
  });

  it("should update config flags via PATCH", async () => {
    await db.insert(userIntegrations).values({
      userId: testUserId,
      provider: "fitdays",
      accountIdentifier: "fitdays@example.com",
      encryptedCredentials: encryptJson({
        email: "fitdays@example.com",
        passwordHash: "HASH",
        token: "tok",
        uid: 101,
      }),
      configJson: JSON.stringify({
        skipWeightOnly: true,
      }),
      status: "connected",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest("http://localhost/api/integrations/fitdays", {
      method: "PATCH",
      body: JSON.stringify({
        skipWeightOnly: false,
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });

    const res = await patchFitdaysConfig(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.config.skipWeightOnly).toBe(false);
  });

  it("should revoke and delete integration via DELETE", async () => {
    await db.insert(userIntegrations).values({
      userId: testUserId,
      provider: "fitdays",
      accountIdentifier: "fitdays@example.com",
      encryptedCredentials: encryptJson({ email: "f@e.com", passwordHash: "H" }),
      status: "connected",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest("http://localhost/api/integrations/fitdays", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const res = await disconnectFitdays(req);
    expect(res.status).toBe(200);

    const remaining = await db.query.userIntegrations.findMany({
      where: eq(userIntegrations.userId, testUserId),
    });
    expect(remaining).toHaveLength(0);
  });
});
