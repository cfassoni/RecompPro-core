import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { userIntegrations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { HevyClient, HevyApiError } from "@/lib/hevy/client";
import { encryptJson } from "@/lib/crypto";
import { syncExerciseTemplates } from "@/lib/hevy/sync";
import crypto from "node:crypto";

export const POST = withAuth(async (req, { user }) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json(
        { detail: "Hevy API key is required" },
        { status: 400 }
      );
    }

    const trimmedKey = apiKey.trim();
    const client = new HevyClient({ apiKey: trimmedKey });

    // Validate the API key against Hevy's public API
    let userInfo;
    try {
      userInfo = await client.getUserInfo();
    } catch (err: unknown) {
      const errStatus =
        err instanceof HevyApiError
          ? err.status
          : typeof err === "object" && err !== null && "status" in err
          ? Number((err as { status: unknown }).status)
          : null;

      if (errStatus === 401 || errStatus === 403) {
        return NextResponse.json(
          { detail: "Invalid Hevy API key. Please check your developer settings on hevy.com." },
          { status: 401 }
        );
      }
      throw err;
    }

    const accountIdentifier =
      userInfo.username || userInfo.email || `hevy_user_${userInfo.id || user.id}`;

    const webhookToken = crypto.randomBytes(24).toString("hex");
    const encryptedCredentials = encryptJson({ apiKey: trimmedKey });

    const existing = await db.query.userIntegrations.findFirst({
      where: and(
        eq(userIntegrations.userId, user.id),
        eq(userIntegrations.provider, "hevy")
      ),
    });

    const configData = {
      webhookToken,
      hevyUserId: userInfo.id ?? null,
      username: userInfo.username ?? null,
    };

    if (existing) {
      await db
        .update(userIntegrations)
        .set({
          accountIdentifier,
          encryptedCredentials,
          configJson: JSON.stringify(configData),
          status: "connected",
          lastSyncError: null,
          updatedAt: new Date(),
        })
        .where(eq(userIntegrations.id, existing.id));
    } else {
      await db.insert(userIntegrations).values({
        userId: user.id,
        provider: "hevy",
        accountIdentifier,
        encryptedCredentials,
        configJson: JSON.stringify(configData),
        status: "connected",
      });
    }

    // Proactively sync standard exercise templates
    try {
      await syncExerciseTemplates(client, user.id);
    } catch (tplErr) {
      console.warn("Could not immediately sync exercise templates:", tplErr);
    }

    return NextResponse.json({
      success: true,
      accountIdentifier,
      webhookToken,
      webhookPath: `/api/integrations/hevy/webhook/${webhookToken}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to connect Hevy:", msg);
    return NextResponse.json(
      { detail: "Failed to connect to Hevy API" },
      { status: 500 }
    );
  }
});
