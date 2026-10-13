import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { userIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { HevyClient } from "@/lib/hevy/client";
import { decryptJson } from "@/lib/crypto";
import { upsertHevyWorkout, deleteHevyWorkout } from "@/lib/hevy/sync";

interface RouteParams {
  params: Promise<{
    token: string;
  }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    if (!token || typeof token !== "string" || token.length < 16) {
      return NextResponse.json({ detail: "Invalid webhook token" }, { status: 400 });
    }

    // Find the matching user integration by comparing the webhookToken in configJson
    const integrations = await db.query.userIntegrations.findMany({
      where: eq(userIntegrations.provider, "hevy"),
    });

    const integration = integrations.find((item) => {
      if (!item.configJson) return false;
      try {
        const parsed = JSON.parse(item.configJson);
        return parsed.webhookToken === token;
      } catch {
        return false;
      }
    });

    if (!integration || integration.status !== "connected") {
      return NextResponse.json(
        { detail: "Webhook not found or integration is inactive" },
        { status: 404 }
      );
    }

    const payload = await req.json().catch(() => ({}));
    const eventType = String(payload.type || "WORKOUT_CREATED").toUpperCase();
    const workoutId = String(payload.id || payload.workoutId || payload.workout?.id || "");

    if (!workoutId) {
      return NextResponse.json(
        { detail: "Missing workout id in webhook payload" },
        { status: 400 }
      );
    }

    if (eventType === "WORKOUT_DELETED") {
      await deleteHevyWorkout(workoutId, integration.userId);
      return NextResponse.json({ success: true, action: "deleted" });
    }

    // For WORKOUT_CREATED or updates, fetch full details from Hevy and upsert
    let workoutData = payload.workout;
    if (!workoutData || !workoutData.exercises) {
      const credentials = decryptJson<{ apiKey: string }>(
        integration.encryptedCredentials
      );
      const client = new HevyClient({ apiKey: credentials.apiKey });
      workoutData = await client.getWorkout(workoutId);
    }

    const action = await upsertHevyWorkout(workoutData, integration.userId);

    await db
      .update(userIntegrations)
      .set({
        lastSyncedAt: new Date(),
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(userIntegrations.id, integration.id));

    return NextResponse.json({ success: true, action });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Hevy webhook error:", msg);
    return NextResponse.json(
      { detail: `Webhook handling error: ${msg}` },
      { status: 500 }
    );
  }
}
