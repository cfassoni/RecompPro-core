import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { userIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";

export const GET = withAuth(async (_req, { user }) => {
  try {
    const list = await db.query.userIntegrations.findMany({
      where: eq(userIntegrations.userId, user.id),
    });

    const sanitized = list.map((item) => {
      let config: Record<string, unknown> = {};
      if (item.configJson) {
        try {
          config = JSON.parse(item.configJson);
        } catch {
          config = {};
        }
      }

      return {
        id: item.id,
        provider: item.provider,
        accountIdentifier: item.accountIdentifier,
        status: item.status,
        lastSyncedAt: item.lastSyncedAt ? item.lastSyncedAt.toISOString() : null,
        lastSyncError: item.lastSyncError,
        config: {
          baseUrl: config.baseUrl,
          selectedSuid: config.selectedSuid,
          selectedProfileName: config.selectedProfileName,
          skipWeightOnly: config.skipWeightOnly ?? true,
          profiles: config.profiles ?? [],
          devices: config.devices ?? [],
          webhookToken: config.webhookToken,
          webhookPath: config.webhookToken
            ? `/api/integrations/hevy/webhook/${config.webhookToken}`
            : undefined,
          ...config,
        },
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    });

    return NextResponse.json(sanitized);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to list integrations:", msg);
    return NextResponse.json(
      { detail: "Failed to list integrations" },
      { status: 500 }
    );
  }
});
