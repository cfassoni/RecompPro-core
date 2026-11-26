import { db } from "@/db/client";
import { userIntegrations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { RecompFitdaysClient } from "@/lib/fitdays/client";
import {
  filterFitdaysRecords,
  normalizeFitdaysRecord,
  upsertFitdaysRecords,
} from "@/lib/fitdays/sync";
import { HevyClient } from "@/lib/hevy/client";
import { syncHevyWorkouts } from "@/lib/hevy/sync";
import { ServiceError } from "./errors";

const SECRET_CONFIG_KEYS = new Set([
  "webhookToken",
  "webhookPath",
  "webhookSecret",
  "apiKey",
  "token",
  "refreshToken",
  "passwordHash",
]);

function redactIntegrationConfig(config: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {
    baseUrl: config.baseUrl,
    selectedSuid: config.selectedSuid,
    selectedProfileName: config.selectedProfileName,
    skipWeightOnly: config.skipWeightOnly ?? true,
    profiles: config.profiles ?? [],
    devices: config.devices ?? [],
    hasWebhookConfigured: Boolean(config.webhookToken),
  };

  for (const [key, value] of Object.entries(config)) {
    if (!SECRET_CONFIG_KEYS.has(key) && !(key in safe)) {
      safe[key] = value;
    }
  }

  return safe;
}

/**
 * Lists connected user integrations. When `redactSecrets` is true (MCP surface), strips webhook tokens/paths.
 */
export async function listIntegrations(
  userId: number,
  options: { redactSecrets?: boolean } = {}
) {
  const list = await db.query.userIntegrations.findMany({
    where: eq(userIntegrations.userId, userId),
  });

  return list.map((item) => {
    let config: Record<string, unknown> = {};
    if (item.configJson) {
      try {
        config = JSON.parse(item.configJson);
      } catch {
        config = {};
      }
    }

    const formattedConfig = options.redactSecrets
      ? redactIntegrationConfig(config)
      : {
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
        };

    return {
      id: item.id,
      provider: item.provider,
      accountIdentifier: item.accountIdentifier,
      status: item.status,
      lastSyncedAt: item.lastSyncedAt ? item.lastSyncedAt.toISOString() : null,
      lastSyncError: item.lastSyncError,
      config: formattedConfig,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  });
}

/**
 * Triggers an incremental or full Fitdays Cloud sync for the configured member profile.
 */
export async function triggerFitdaysSync(
  userId: number,
  options: { forceFull?: boolean } = {}
) {
  const forceFull = Boolean(options.forceFull);

  const integration = await db.query.userIntegrations.findFirst({
    where: and(
      eq(userIntegrations.userId, userId),
      eq(userIntegrations.provider, "fitdays")
    ),
  });

  if (!integration) {
    throw new ServiceError("Fitdays integration not found", 404, "INTEGRATION_NOT_FOUND");
  }

  if (integration.status !== "connected") {
    throw new ServiceError(
      "Fitdays integration is disconnected or inactive",
      400,
      "INTEGRATION_DISCONNECTED"
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
    throw new ServiceError(
      "No member profile selected for this integration",
      400,
      "NO_PROFILE_SELECTED"
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

      throw new ServiceError(`Sync failed: ${errorMsg}`, 502, "FITDAYS_SYNC_FAILED");
    }
  }

  const filtered = filterFitdaysRecords(syncData.weight_list || [], {
    selectedSuid,
    skipWeightOnly: config.skipWeightOnly ?? true,
  });

  const normalized = filtered.map(normalizeFitdaysRecord);
  const result = await upsertFitdaysRecords(userId, normalized, db);
  const syncedAt = new Date();

  await db
    .update(userIntegrations)
    .set({
      configJson: JSON.stringify(config),
      lastSyncedAt: syncedAt,
      lastSyncError: null,
      updatedAt: syncedAt,
    })
    .where(eq(userIntegrations.id, integration.id));

  return {
    success: true,
    result,
    lastSyncedAt: syncedAt.toISOString(),
  };
}

/**
 * Triggers an incremental or full Hevy workout sync for the user.
 */
export async function triggerHevySync(
  userId: number,
  options: { forceFull?: boolean; pageSize?: number } = {}
) {
  const forceFull = Boolean(options.forceFull);
  const pageSize = options.pageSize ?? 10;

  const integration = await db.query.userIntegrations.findFirst({
    where: and(
      eq(userIntegrations.userId, userId),
      eq(userIntegrations.provider, "hevy")
    ),
  });

  if (!integration) {
    throw new ServiceError("Hevy integration not configured", 404, "INTEGRATION_NOT_FOUND");
  }

  if (integration.status !== "connected") {
    throw new ServiceError("Hevy integration is not connected", 400, "INTEGRATION_DISCONNECTED");
  }

  const credentials = decryptJson<{ apiKey: string }>(
    integration.encryptedCredentials
  );

  const client = new HevyClient({ apiKey: credentials.apiKey });

  try {
    const syncResult = await syncHevyWorkouts(client, userId, { forceFull, pageSize });

    await db
      .update(userIntegrations)
      .set({
        lastSyncedAt: new Date(),
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(userIntegrations.id, integration.id));

    return {
      success: true,
      message: "Workouts synchronized successfully",
      syncedWorkouts: syncResult.inserted,
      totalWorkouts: syncResult.total,
      ...syncResult,
    };
  } catch (syncErr: unknown) {
    const errorMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
    await db
      .update(userIntegrations)
      .set({
        lastSyncError: errorMsg,
        updatedAt: new Date(),
      })
      .where(eq(userIntegrations.id, integration.id));

    throw new ServiceError(`Hevy sync failed: ${errorMsg}`, 502, "HEVY_SYNC_FAILED");
  }
}
