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
    const body = await req.json().catch(() => ({}));
    const { forceFull = false } = body;

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

    if (integration.status !== "connected") {
      return NextResponse.json(
        { detail: "Fitdays integration is disconnected or inactive" },
        { status: 400 }
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

    const selectedSuid = config.selectedSuid;
    if (selectedSuid === undefined || selectedSuid === null) {
      return NextResponse.json(
        { detail: "No member profile selected for this integration" },
        { status: 400 }
      );
    }

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

    const performSync = async () => {
      if (forceFull || !integration.lastSyncedAt) {
        return client.syncAll();
      }
      const syncTimeSeconds = Math.floor(integration.lastSyncedAt.getTime() / 1000);
      return client.syncIncrements(syncTimeSeconds);
    };

    let syncData;
    try {
      const res = await performSync();
      syncData = res.data;
    } catch {
      // Self-healing token re-auth attempt
      try {
        const newSession = await client.loginWithPasswordHash(
          credentials.email,
          credentials.passwordHash
        );
        credentials.token = newSession.token;
        credentials.uid = newSession.uid;
        credentials.refreshToken = newSession.refreshToken;

        const res = await performSync();
        syncData = res.data;

        // Persist refreshed tokens
        await db
          .update(userIntegrations)
          .set({
            encryptedCredentials: encryptJson(credentials),
            updatedAt: new Date(),
          })
          .where(eq(userIntegrations.id, integration.id));
      } catch (retryErr) {
        const errorMsg =
          retryErr instanceof Error ? retryErr.message : String(retryErr);
        await db
          .update(userIntegrations)
          .set({
            lastSyncError: errorMsg,
            updatedAt: new Date(),
          })
          .where(eq(userIntegrations.id, integration.id));

        return NextResponse.json(
          { detail: `Sync failed: ${errorMsg}` },
          { status: 502 }
        );
      }
    }

    const filtered = filterFitdaysRecords(syncData.weight_list || [], {
      selectedSuid,
      skipWeightOnly: config.skipWeightOnly ?? true,
    });

    const normalized = filtered.map(normalizeFitdaysRecord);
    const result = await upsertFitdaysRecords(user.id, normalized, db);

    await db
      .update(userIntegrations)
      .set({
        configJson: JSON.stringify(config),
        lastSyncedAt: new Date(),
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(userIntegrations.id, integration.id));

    return NextResponse.json({
      success: true,
      result,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Sync Fitdays error:", msg);
    return NextResponse.json(
      { detail: `Failed to synchronize: ${msg}` },
      { status: 500 }
    );
  }
});
