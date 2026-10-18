import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { userIntegrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const DELETE = withAuth(async (_req, { user }) => {
  try {
    await db
      .delete(userIntegrations)
      .where(
        and(
          eq(userIntegrations.userId, user.id),
          eq(userIntegrations.provider, "fitdays")
        )
      );

    return NextResponse.json({ success: true, message: "Fitdays integration revoked" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Disconnect Fitdays error:", msg);
    return NextResponse.json(
      { detail: `Failed to disconnect integration: ${msg}` },
      { status: 500 }
    );
  }
});

export const PATCH = withAuth(async (req, { user }) => {
  try {
    const body = await req.json();
    const { skipWeightOnly } = body;

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

    let config: Record<string, unknown> = {};
    if (integration.configJson) {
      try {
        config = JSON.parse(integration.configJson);
      } catch {
        config = {};
      }
    }

    if (skipWeightOnly !== undefined) {
      config.skipWeightOnly = Boolean(skipWeightOnly);
    }

    await db
      .update(userIntegrations)
      .set({
        configJson: JSON.stringify(config),
        updatedAt: new Date(),
      })
      .where(eq(userIntegrations.id, integration.id));

    return NextResponse.json({
      success: true,
      config: {
        baseUrl: config.baseUrl,
        selectedSuid: config.selectedSuid,
        selectedProfileName: config.selectedProfileName,
        skipWeightOnly: config.skipWeightOnly,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Update Fitdays config error:", msg);
    return NextResponse.json(
      { detail: `Failed to update configuration: ${msg}` },
      { status: 500 }
    );
  }
});
