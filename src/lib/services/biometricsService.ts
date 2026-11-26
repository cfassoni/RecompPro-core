import { db } from "@/db/client";
import { recompRecords } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { safeToISOString } from "@/lib/dateUtils";
import { formatRecordResponse } from "@/lib/recordFormat";
import { syncAutoShareLinksForUser } from "@/lib/sharedLinkFormat";
import { parseDateRangeBound, ServiceError } from "./errors";

export type BiometricsPeriod = "all" | "1m" | "3m" | "6m" | "1y";
export type FormattedRecord = ReturnType<typeof formatRecordResponse>;

const SEGMENTAL_PREFIXES = [
  "right_arm_",
  "left_arm_",
  "trunk_",
  "right_leg_",
  "left_leg_",
] as const;

export function getPeriodCutoffDate(
  period: BiometricsPeriod,
  now: Date = new Date()
): Date | null {
  if (period === "all") return null;
  const days =
    period === "1m" ? 30 : period === "3m" ? 90 : period === "6m" ? 180 : 365;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

export function stripSegmentalFields<T extends Record<string, unknown>>(
  record: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!SEGMENTAL_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Lists all biometric records for a user in chronological ascending order (REST `/api/records` contract).
 */
export async function listAllBiometricRecords(userId: number): Promise<FormattedRecord[]> {
  const records = await db.query.recompRecords.findMany({
    where: eq(recompRecords.userId, userId),
    orderBy: [asc(recompRecords.date)],
    with: {
      report: true,
    },
  });

  return records.map((r) => formatRecordResponse(r, r.report));
}

export interface QueryBiometricRecordsOptions {
  from?: string;
  to?: string;
  starredOnly?: boolean;
  limit?: number;
  offset?: number;
  includeSegmental?: boolean;
}

/**
 * Queries biometric scans with date filtering, starred filtering, pagination, and optional segmental suppression.
 */
export async function queryBiometricRecords(
  userId: number,
  options: QueryBiometricRecordsOptions = {}
) {
  const fromDate = options.from ? parseDateRangeBound(options.from, "start") : null;
  const toDate = options.to ? parseDateRangeBound(options.to, "end") : null;
  const starredOnly = Boolean(options.starredOnly);
  const includeSegmental = Boolean(options.includeSegmental);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 50)));

  const allRecords = await db.query.recompRecords.findMany({
    where: eq(recompRecords.userId, userId),
    orderBy: [desc(recompRecords.date)],
    with: {
      report: true,
    },
  });

  const filtered = allRecords.filter((r) => {
    if (starredOnly && !r.starred) return false;
    if (fromDate && r.date < fromDate) return false;
    if (toDate && r.date > toDate) return false;
    return true;
  });

  const total = filtered.length;
  const sliced = filtered.slice(offset, offset + limit);
  const records = sliced.map((r) => {
    const formatted = formatRecordResponse(r, r.report);
    return includeSegmental ? formatted : stripSegmentalFields(formatted);
  });

  return {
    total,
    limit,
    offset,
    has_more: offset + records.length < total,
    records,
  };
}

/**
 * Fetches a single full biometric record (core + 5-segment metrics + report metadata) owned by the user.
 */
export async function getBiometricRecordById(
  userId: number,
  recordId: number
): Promise<FormattedRecord> {
  if (!Number.isInteger(recordId) || recordId <= 0) {
    throw new ServiceError("Invalid record ID", 400, "INVALID_RECORD_ID");
  }

  const record = await db.query.recompRecords.findFirst({
    where: and(eq(recompRecords.id, recordId), eq(recompRecords.userId, userId)),
    with: {
      report: true,
    },
  });

  if (!record) {
    throw new ServiceError("Record not found", 404, "RECORD_NOT_FOUND");
  }

  return formatRecordResponse(record, record.report);
}

/**
 * Fetches the user's most recent biometric record, or null if none exist.
 */
export async function getLatestBiometricRecord(
  userId: number
): Promise<FormattedRecord | null> {
  const record = await db.query.recompRecords.findFirst({
    where: eq(recompRecords.userId, userId),
    orderBy: [desc(recompRecords.date)],
    with: {
      report: true,
    },
  });

  return record ? formatRecordResponse(record, record.report) : null;
}

/**
 * Computes aggregated body composition deltas and weight history, optionally scoped to a period.
 */
export async function getBiometricsSummary(
  userId: number,
  options: { period?: BiometricsPeriod } = {}
) {
  const allRecords = await db.query.recompRecords.findMany({
    where: eq(recompRecords.userId, userId),
    orderBy: [asc(recompRecords.date)],
  });

  const cutoff = options.period ? getPeriodCutoffDate(options.period) : null;
  const records = cutoff ? allRecords.filter((r) => r.date >= cutoff) : allRecords;

  const totalRecords = records.length;
  if (totalRecords === 0) {
    return {
      total_records: 0,
      weight_history: [],
    };
  }

  const first = records[0];
  const last = records[records.length - 1];

  const weightHistory = records.map((r) => ({
    date: safeToISOString(r.date, true),
    weight: r.weight,
    body_fat_pct: r.bodyFatPct,
    body_fat_mass: r.fatMass,
    muscle_mass: r.muscleMass,
    skeletal_muscle_mass: r.skeletalMuscleMass,
    skeletal_muscle_mass_pct: r.skeletalMuscleMassPct,
  }));

  const round2 = (num: number) => Math.round(num * 100) / 100;

  return {
    total_records: totalRecords,
    first_record_date: safeToISOString(first.date),
    latest_record_date: safeToISOString(last.date),
    starting_weight: first.weight,
    current_weight: last.weight,
    weight_change: round2(last.weight - first.weight),
    starting_body_fat: first.bodyFatPct,
    current_body_fat: last.bodyFatPct,
    body_fat_change: round2(last.bodyFatPct - first.bodyFatPct),
    starting_body_fat_mass: first.fatMass,
    current_body_fat_mass: last.fatMass,
    body_fat_mass_change: round2(last.fatMass - first.fatMass),
    starting_muscle_mass: first.muscleMass,
    current_muscle_mass: last.muscleMass,
    muscle_mass_change: round2(last.muscleMass - first.muscleMass),
    starting_skeletal_muscle_mass: first.skeletalMuscleMass,
    current_skeletal_muscle_mass: last.skeletalMuscleMass,
    skeletal_muscle_mass_change: round2(last.skeletalMuscleMass - first.skeletalMuscleMass),
    starting_skeletal_muscle_mass_pct: first.skeletalMuscleMassPct,
    current_skeletal_muscle_mass_pct: last.skeletalMuscleMassPct,
    skeletal_muscle_mass_pct_change: round2(
      last.skeletalMuscleMassPct - first.skeletalMuscleMassPct
    ),
    weight_history: weightHistory,
  };
}

/**
 * Sets or toggles the `starred` flag on a biometric record and syncs auto-share links.
 */
export async function toggleBiometricRecordStar(
  userId: number,
  recordId: number,
  starred?: boolean
) {
  if (!Number.isInteger(recordId) || recordId <= 0) {
    throw new ServiceError("Invalid record ID", 400, "INVALID_RECORD_ID");
  }

  const record = await db.query.recompRecords.findFirst({
    where: and(eq(recompRecords.id, recordId), eq(recompRecords.userId, userId)),
  });

  if (!record) {
    throw new ServiceError("Record not found", 404, "RECORD_NOT_FOUND");
  }

  const targetStarred = typeof starred === "boolean" ? starred : !record.starred;

  const [updated] = await db
    .update(recompRecords)
    .set({ starred: targetStarred })
    .where(and(eq(recompRecords.id, recordId), eq(recompRecords.userId, userId)))
    .returning();

  await syncAutoShareLinksForUser(userId);

  return {
    success: true,
    id: recordId,
    starred: Boolean(updated?.starred),
  };
}

/**
 * Deletes specific biometric records owned by the user, reporting per-ID outcomes.
 */
export async function deleteBiometricRecords(userId: number, recordIds: number[]) {
  const deletedIds: number[] = [];
  const failedDeletions: { id: number; reason: string }[] = [];

  for (const rawId of recordIds) {
    const recId = Number(rawId);
    const record = await db.query.recompRecords.findFirst({
      where: eq(recompRecords.id, recId),
    });

    if (!record) {
      failedDeletions.push({ id: recId, reason: "not_found" });
    } else if (record.userId !== userId) {
      failedDeletions.push({ id: recId, reason: "unauthorized" });
    } else {
      await db.delete(recompRecords).where(eq(recompRecords.id, recId));
      deletedIds.push(recId);
    }
  }

  return {
    deleted: deletedIds,
    failed: failedDeletions,
  };
}
