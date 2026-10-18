import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { userIntegrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { HevyClient } from "@/lib/hevy/client";
import { decryptJson } from "@/lib/crypto";
import { syncHevyWorkouts } from "@/lib/hevy/sync";

export const POST = withAuth(async (req, { user }) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { forceFull = false, pageSize = 10 } = body;

    const integration = await db.query.userIntegrations.findFirst({
      where: and(
        eq(userIntegrations.userId, user.id),
        eq(userIntegrations.provider, "hevy")
      ),
    });

    if (!integration) {
      return NextResponse.json(
        { detail: "Hevy integration not configured" },
        { status: 404 }
      );
    }

    if (integration.status !== "connected") {
      return NextResponse.json(
        { detail: "Hevy integration is not connected" },
        { status: 400 }
      );
    }

    const credentials = decryptJson<{ apiKey: string }>(
      integration.encryptedCredentials
    );

    const client = new HevyClient({ apiKey: credentials.apiKey });

    try {
      const syncResult = await syncHevyWorkouts(client, user.id, { forceFull, pageSize });

      await db
        .update(userIntegrations)
        .set({
          lastSyncedAt: new Date(),
          lastSyncError: null,
          updatedAt: new Date(),
        })
        .where(eq(userIntegrations.id, integration.id));

      return NextResponse.json({
        success: true,
        message: "Workouts synchronized successfully",
        syncedWorkouts: syncResult.inserted,
        totalWorkouts: syncResult.total,
        ...syncResult,
      });
    } catch (syncErr: unknown) {
      const errorMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
      await db
        .update(userIntegrations)
        .set({
          lastSyncError: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(userIntegrations.id, integration.id));

      return NextResponse.json(
        { detail: `Hevy sync failed: ${errorMsg}` },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to run Hevy sync:", msg);
    return NextResponse.json(
      { detail: "Failed to run Hevy sync" },
      { status: 500 }
    );
  }
});
