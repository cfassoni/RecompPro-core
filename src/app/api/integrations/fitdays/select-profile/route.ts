import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { userIntegrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { RecompFitdaysClient } from "@/lib/fitdays/client";
import { decryptJson, encryptJson } from "@/lib/crypto";
import {
  filterFitdaysRecords,
  normalizeFitdaysRecord,
  upsertFitdaysRecords,
} from "@/lib/fitdays/sync";

export const POST = withAuth(async (req, { user }) => {
  try {
    const body = await req.json();
    const { suid, syncNow = true } = body;

    if (suid === undefined || suid === null) {
      return NextResponse.json(
        { detail: "A member profile suid is required" },
        { status: 400 }
      );
    }

    const integration = await db.query.userIntegrations.findFirst({
      where: and(
        eq(userIntegrations.userId, user.id),
        eq(userIntegrations.provider, "fitdays")
      ),
    });

    if (!integration) {
      return NextResponse.json(
        { detail: "Fitdays integration not found" },
        { status: 404 }
      );
    }

    interface FitdaysConfig {
      profiles?: Array<{ suid: number; nickname: string }>;
      selectedSuid?: number;
      selectedProfileName?: string;
      skipWeightOnly?: boolean;
      baseUrl?: string;
      country?: string;
      [key: string]: unknown;
    }

    let config: FitdaysConfig = {};
    if (integration.configJson) {
      try {
        config = JSON.parse(integration.configJson);
      } catch {
        config = {};
      }
    }

    const profiles = config.profiles || [];
    const matchedProfile = profiles.find((p) => p.suid === suid);

    config.selectedSuid = suid;
    if (matchedProfile) {
      config.selectedProfileName = matchedProfile.nickname;
    }

    let syncResult = { inserted: 0, updated: 0, totalProcessed: 0 };

    if (syncNow) {
      const credentials = decryptJson<{
        email: string;
        passwordHash: string;
        token: string;
        uid: number;
        refreshToken?: string;
      }>(integration.encryptedCredentials);

      const client = new RecompFitdaysClient({
        baseUrl: config.baseUrl,
        country: config.country,
        onBaseUrlChanged: (newUrl) => {
          config.baseUrl = newUrl;
        },
      });

      client.session = {
        token: credentials.token,
        uid: credentials.uid,
        refreshToken: credentials.refreshToken || "",
      };

      let syncData;
      try {
        const res = await client.syncAll();
        syncData = res.data;
      } catch (err: unknown) {
        // Self-healing re-auth if session token expired
        try {
          const newSession = await client.loginWithPasswordHash(
            credentials.email,
            credentials.passwordHash
          );
          credentials.token = newSession.token;
          credentials.uid = newSession.uid;
          credentials.refreshToken = newSession.refreshToken;

          const res = await client.syncAll();
          syncData = res.data;

          // Save refreshed credentials
          await db
            .update(userIntegrations)
            .set({
              encryptedCredentials: encryptJson(credentials),
              updatedAt: new Date(),
            })
            .where(eq(userIntegrations.id, integration.id));
        } catch {
          throw new Error(
            `Fitdays sync failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      const filtered = filterFitdaysRecords(syncData.weight_list || [], {
        selectedSuid: suid,
        skipWeightOnly: config.skipWeightOnly ?? true,
      });

      const normalized = filtered.map(normalizeFitdaysRecord);
      syncResult = await upsertFitdaysRecords(user.id, normalized, db);
    }

    await db
      .update(userIntegrations)
      .set({
        configJson: JSON.stringify(config),
        lastSyncedAt: syncNow ? new Date() : integration.lastSyncedAt,
        lastSyncError: null,
        status: "connected",
        updatedAt: new Date(),
      })
      .where(eq(userIntegrations.id, integration.id));

    return NextResponse.json({
      success: true,
      selectedSuid: suid,
      selectedProfileName: config.selectedProfileName,
      result: syncResult,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Select Fitdays profile error:", msg);
    return NextResponse.json(
      { detail: `Failed to select profile: ${msg}` },
      { status: 500 }
    );
  }
});
