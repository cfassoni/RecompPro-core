import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { userIntegrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";

export const POST = withAuth(async (_req, { user }) => {
  try {
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

    let config: Record<string, unknown> = {};
    if (integration.configJson) {
      try {
        config = JSON.parse(integration.configJson);
      } catch {
        config = {};
      }
    }

    const newWebhookToken = crypto.randomBytes(24).toString("hex");
    config.webhookToken = newWebhookToken;

    await db
      .update(userIntegrations)
      .set({
        configJson: JSON.stringify(config),
        updatedAt: new Date(),
      })
      .where(eq(userIntegrations.id, integration.id));

    return NextResponse.json({
      success: true,
      webhookToken: newWebhookToken,
      webhookPath: `/api/integrations/hevy/webhook/${newWebhookToken}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to regenerate webhook token:", msg);
    return NextResponse.json(
      { detail: "Failed to regenerate webhook token" },
      { status: 500 }
    );
  }
});
