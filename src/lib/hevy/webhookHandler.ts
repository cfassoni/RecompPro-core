import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { userIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { HevyClient } from "./client";
import { decryptJson } from "@/lib/crypto";
import { upsertHevyWorkout, deleteHevyWorkout } from "./sync";

function getTimestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Common handler for incoming Hevy webhooks.
 * Supports authentication via:
 * 1. HTTP `Authorization: Bearer <token>` header (or raw token)
 * 2. URL route parameter `token`
 *
 * Adheres strictly to Hevy's 5-second SLA and observability guidelines.
 */
export async function handleHevyWebhook(
  req: NextRequest,
  pathToken?: string
): Promise<NextResponse> {
  const ts = getTimestamp();

  try {
    // 1. Extract and normalize authentication token
    let headerToken: string | undefined;
    const authHeader = req.headers.get("authorization")?.trim();
    if (authHeader) {
      if (/^bearer\s+/i.test(authHeader)) {
        headerToken = authHeader.replace(/^bearer\s+/i, "").trim();
      } else {
        headerToken = authHeader;
      }
    }

    // Determine effective token
    const effectiveToken = headerToken || pathToken;

    // If both header and path tokens are provided, ensure they match
    if (headerToken && pathToken && headerToken !== pathToken) {
      console.warn(
        `[${ts}] [Hevy Webhook] Header token and URL token mismatch.`
      );
      return NextResponse.json(
        { detail: "Unauthorized: Token mismatch between header and URL" },
        { status: 401 }
      );
    }

    if (!effectiveToken || effectiveToken.length < 16) {
      console.warn(`[${ts}] [Hevy Webhook] Missing or invalid token received.`);
      return NextResponse.json(
        { detail: "Unauthorized: Missing or invalid webhook authorization token" },
        { status: 401 }
      );
    }

    // 2. Find matching user integration
    const integrations = await db.query.userIntegrations.findMany({
      where: eq(userIntegrations.provider, "hevy"),
    });

    const integration = integrations.find((item) => {
      if (!item.configJson) return false;
      try {
        const parsed = JSON.parse(item.configJson);
        return parsed.webhookToken === effectiveToken;
      } catch {
        return false;
      }
    });

    if (!integration || integration.status !== "connected") {
      console.warn(
        `[${ts}] [Hevy Webhook] No active integration found for provided token.`
      );
      return NextResponse.json(
        { detail: "Webhook not found or integration is inactive" },
        { status: 401 }
      );
    }

    // 3. Parse JSON payload
    const payload = await req.json().catch(() => ({}));
    const eventType = String(payload.type || "WORKOUT_CREATED").toUpperCase();

    // Extract workoutId from various possible Hevy payload structures
    const workoutId = String(
      payload.workoutId ||
        payload.payload?.workoutId ||
        payload.workout?.id ||
        payload.id ||
        ""
    ).trim();

    if (!workoutId) {
      console.warn(
        `[${ts}] [Hevy Webhook] Missing workout id in payload: ${JSON.stringify(payload)}`
      );
      return NextResponse.json(
        { detail: "Missing workout id in webhook payload" },
        { status: 400 }
      );
    }

    // 4. Handle Deletion event
    if (eventType === "WORKOUT_DELETED") {
      await deleteHevyWorkout(workoutId, integration.userId);
      console.log(
        `[${ts}] [Hevy Webhook] Workout ${workoutId} deleted for user ${integration.userId}`
      );
      return NextResponse.json({ success: true, action: "deleted" }, { status: 200 });
    }

    // 5. Fetch full workout if needed (configured with 3.5s timeout for 5s SLA)
    let workoutData = payload.workout;
    const credentials = decryptJson<{ apiKey: string }>(
      integration.encryptedCredentials
    );
    const client = new HevyClient({
      apiKey: credentials.apiKey,
      maxRetries: 1,
      timeoutMs: 3500,
    });

    if (!workoutData || !workoutData.exercises || !Array.isArray(workoutData.exercises)) {
      workoutData = await client.getWorkout(workoutId);
    }

    // 6. Upsert workout with auto-resolving template client
    const action = await upsertHevyWorkout(workoutData, integration.userId, client);

    // 7. Update integration sync status
    await db
      .update(userIntegrations)
      .set({
        lastSyncedAt: new Date(),
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(userIntegrations.id, integration.id));

    console.log(
      `[${ts}] [Hevy Webhook] Workout ${workoutId} synced (${action}) for user ${integration.userId}`
    );

    return NextResponse.json({ success: true, action }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${ts}] [Hevy Webhook] Error processing webhook: ${msg}`);
    return NextResponse.json(
      { detail: `Webhook handling error: ${msg}` },
      { status: 500 }
    );
  }
}
