import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { userIntegrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { RecompFitdaysClient } from "@/lib/fitdays/client";
import { encryptJson } from "@/lib/crypto";

export const POST = withAuth(async (req, { user }) => {
  try {
    const body = await req.json();
    const { email, password, country, region } = body;

    if (!email || !password) {
      return NextResponse.json(
        { detail: "Email and password are required" },
        { status: 400 }
      );
    }

    const client = new RecompFitdaysClient({
      country,
      region: region || "us",
    });

    let loginResult;
    try {
      loginResult = await client.loginWithPlainPassword(email, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { detail: `Fitdays authentication failed: ${msg}` },
        { status: 400 }
      );
    }

    const { session, passwordHash } = loginResult;

    // Discover profiles and devices
    let syncData;
    try {
      const now = Math.floor(Date.now() / 1000);
      const res = await client.syncFromServer({
        startTime: now,
        endTime: now - 86400 * 7, // 7 days window for fast initial probe
      });
      syncData = res.data;
    } catch {
      // If window sync throws, try minimal discovery
      syncData = {
        users: [],
        devices: [],
        bind_device: [],
        account: { active_suid: 0 },
      };
    }

    const profiles = (syncData.users || [])
      .filter((u) => u.is_deleted === 0)
      .map((u) => ({
        suid: u.suid,
        nickname: u.nickname,
        height: u.height,
        birthday: u.birthday,
        target_weight: u.target_weight,
        sex: u.sex,
      }));

    const devices = (syncData.devices || []).map((d) => ({
      name: d.name,
      model: d.model,
      mac: d.mac,
    }));

    const encryptedCredentials = encryptJson({
      email,
      passwordHash,
      token: session.token,
      uid: session.uid,
      refreshToken: session.refreshToken,
    });

    const config = {
      baseUrl: client.baseUrl,
      country: client.country,
      skipWeightOnly: true,
      selectedSuid: syncData.account?.active_suid || (profiles[0]?.suid ?? 0),
      selectedProfileName:
        profiles.find((p) => p.suid === syncData.account?.active_suid)?.nickname ||
        profiles[0]?.nickname ||
        email,
      profiles,
      devices,
    };

    const existing = await db.query.userIntegrations.findFirst({
      where: and(
        eq(userIntegrations.userId, user.id),
        eq(userIntegrations.provider, "fitdays")
      ),
    });

    if (existing) {
      await db
        .update(userIntegrations)
        .set({
          accountIdentifier: email,
          encryptedCredentials,
          configJson: JSON.stringify(config),
          status: "connected",
          lastSyncError: null,
          updatedAt: new Date(),
        })
        .where(eq(userIntegrations.id, existing.id));
    } else {
      await db.insert(userIntegrations).values({
        userId: user.id,
        provider: "fitdays",
        accountIdentifier: email,
        encryptedCredentials,
        configJson: JSON.stringify(config),
        status: "connected",
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return NextResponse.json({
      success: true,
      activeSuid: syncData.account?.active_suid || profiles[0]?.suid,
      profiles,
      devices,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Connect Fitdays error:", msg);
    return NextResponse.json(
      { detail: `Failed to connect Fitdays: ${msg}` },
      { status: 500 }
    );
  }
});
