import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { userIntegrations, workouts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const GET = withAuth(async (_req, { user }) => {
  try {
    const integration = await db.query.userIntegrations.findFirst({
      where: and(
        eq(userIntegrations.userId, user.id),
        eq(userIntegrations.provider, "hevy")
      ),
    });

    if (!integration) {
      return NextResponse.json({
        connected: false,
      });
    }

    let config: Record<string, unknown> = {};
    if (integration.configJson) {
      try {
        config = JSON.parse(integration.configJson);
      } catch {
        config = {};
      }
    }

    const webhookToken = typeof config.webhookToken === "string" ? config.webhookToken : null;

    return NextResponse.json({
      connected: integration.status === "connected",
      status: integration.status,
      accountIdentifier: integration.accountIdentifier,
      lastSyncedAt: integration.lastSyncedAt ? integration.lastSyncedAt.toISOString() : null,
      lastSyncError: integration.lastSyncError,
      webhookToken,
      webhookPath: webhookToken ? `/api/integrations/hevy/webhook/${webhookToken}` : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to get Hevy status:", msg);
    return NextResponse.json(
      { detail: "Failed to get Hevy integration status" },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const deleteDataParam = url.searchParams.get("deleteData");
    const body = await req.json().catch(() => ({}));
    const shouldDeleteData = deleteDataParam === "true" || body.deleteData === true;

    const integration = await db.query.userIntegrations.findFirst({
      where: and(
        eq(userIntegrations.userId, user.id),
        eq(userIntegrations.provider, "hevy")
      ),
    });

    if (!integration) {
      return NextResponse.json(
        { detail: "Hevy integration not found" },
        { status: 404 }
      );
    }

    // Revoke and delete integration record
    await db.delete(userIntegrations).where(eq(userIntegrations.id, integration.id));

    // Optionally delete cached workout history
    if (shouldDeleteData) {
      await db.delete(workouts).where(eq(workouts.userId, user.id));
    }

    return NextResponse.json({
      success: true,
      message: shouldDeleteData
        ? "Hevy integration disconnected and workout data deleted"
        : "Hevy integration disconnected successfully",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to disconnect Hevy:", msg);
    return NextResponse.json(
      { detail: "Failed to disconnect Hevy integration" },
      { status: 500 }
    );
  }
});
