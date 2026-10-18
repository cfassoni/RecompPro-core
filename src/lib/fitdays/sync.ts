import { normalizeToMinute, formatRecordDateKey } from "@/lib/dateUtils";
import { db } from "@/db/client";
import { recompRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { WeightRecord } from "fitdays-api";

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface NormalizedFitdaysRecord {
  date: Date;
  weight: number;
  bmi: number;
  bodyFatPct: number;
  subcutaneousFatPct: number;
  heartRate: number | null;
  heartIndex: number | null;
  visceralFat: number;
  bodyWaterPct: number;
  skeletalMuscleMassPct: number;
  muscleMass: number;
  boneMass: number;
  proteinPct: number;
  bmr: number;
  metabolicAge: number;
  fatMass: number;
  moistureContent: number;
  skeletalMuscleMass: number;
  muscleRatePct: number;
  proteinMass: number;
  obesityScore: number;
  fatFreeMass: number;
  smi: number;
  bodyScore: number;
  targetWeight: number;
  weightControl: number;
  fatControl: number;
  muscleControl: number;

  rightArmFatMass: number | null;
  rightArmFatPct: number | null;
  rightArmFatLevel: string | null;
  rightArmMuscleMass: number | null;
  rightArmMusclePct: number | null;
  rightArmMuscleLevel: string | null;
  rightArmImpedanceHigh: number | null;
  rightArmImpedanceLow: number | null;

  leftArmFatMass: number | null;
  leftArmFatPct: number | null;
  leftArmFatLevel: string | null;
  leftArmMuscleMass: number | null;
  leftArmMusclePct: number | null;
  leftArmMuscleLevel: string | null;
  leftArmImpedanceHigh: number | null;
  leftArmImpedanceLow: number | null;

  trunkFatMass: number | null;
  trunkFatPct: number | null;
  trunkFatLevel: string | null;
  trunkMuscleMass: number | null;
  trunkMusclePct: number | null;
  trunkMuscleLevel: string | null;
  trunkImpedanceHigh: number | null;
  trunkImpedanceLow: number | null;

  rightLegFatMass: number | null;
  rightLegFatPct: number | null;
  rightLegFatLevel: string | null;
  rightLegMuscleMass: number | null;
  rightLegMusclePct: number | null;
  rightLegMuscleLevel: string | null;
  rightLegImpedanceHigh: number | null;
  rightLegImpedanceLow: number | null;

  leftLegFatMass: number | null;
  leftLegFatPct: number | null;
  leftLegFatLevel: string | null;
  leftLegMuscleMass: number | null;
  leftLegMusclePct: number | null;
  leftLegMuscleLevel: string | null;
  leftLegImpedanceHigh: number | null;
  leftLegImpedanceLow: number | null;
}

/**
 * Extracts 10 segmental impedances for 8-electrode dual-frequency scales if available
 * in ext_data.originalImps or adc_list.
 */
export function parseSegmentalImpedances(
  originalImps?: string | null,
  adcList?: string | null
): {
  rightArmImpedanceHigh: number | null;
  rightArmImpedanceLow: number | null;
  leftArmImpedanceHigh: number | null;
  leftArmImpedanceLow: number | null;
  trunkImpedanceHigh: number | null;
  trunkImpedanceLow: number | null;
  rightLegImpedanceHigh: number | null;
  rightLegImpedanceLow: number | null;
  leftLegImpedanceHigh: number | null;
  leftLegImpedanceLow: number | null;
} {
  const raw = originalImps || adcList || "";
  const parts = raw
    .split(/[,;\s]+/)
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n));

  if (parts.length >= 10) {
    return {
      rightArmImpedanceHigh: parts[0] ?? null,
      rightArmImpedanceLow: parts[1] ?? null,
      leftArmImpedanceHigh: parts[2] ?? null,
      leftArmImpedanceLow: parts[3] ?? null,
      trunkImpedanceHigh: parts[4] ?? null,
      trunkImpedanceLow: parts[5] ?? null,
      rightLegImpedanceHigh: parts[6] ?? null,
      rightLegImpedanceLow: parts[7] ?? null,
      leftLegImpedanceHigh: parts[8] ?? null,
      leftLegImpedanceLow: parts[9] ?? null,
    };
  }

  return {
    rightArmImpedanceHigh: null,
    rightArmImpedanceLow: null,
    leftArmImpedanceHigh: null,
    leftArmImpedanceLow: null,
    trunkImpedanceHigh: null,
    trunkImpedanceLow: null,
    rightLegImpedanceHigh: null,
    rightLegImpedanceLow: null,
    leftLegImpedanceHigh: null,
    leftLegImpedanceLow: null,
  };
}

/**
 * Converts a raw Fitdays WeightRecord (with ext_data) to a NormalizedFitdaysRecord.
 */
export function normalizeFitdaysRecord(rec: WeightRecord): NormalizedFitdaysRecord {
  const date = new Date(rec.measured_time * 1000);
  const weight = rec.weight_g ? round2(rec.weight_g / 1000) : round2(rec.weight_kg ?? 0);
  const bfr = rec.bfr ?? 0;
  const vwc = rec.vwc ?? 0;
  const rosm = rec.rosm ?? 0;
  const rom = rec.rom ?? 0;
  const pp = rec.pp ?? 0;

  const fatMass = round2((weight * bfr) / 100);
  const moistureContent = round2((weight * vwc) / 100);
  const skeletalMuscleMass = round2((weight * rosm) / 100);
  const muscleMass = round2((weight * rom) / 100);
  const proteinMass = round2((weight * pp) / 100);
  const fatFreeMass = round2(weight - fatMass);

  const ext = rec.ext_data;
  const impedances = parseSegmentalImpedances(ext?.originalImps, rec.adc_list);

  return {
    date,
    weight,
    bmi: round2(rec.bmi ?? 0),
    bodyFatPct: round2(bfr),
    subcutaneousFatPct: round2(rec.sfr ?? 0),
    heartRate: rec.hr && rec.hr > 0 ? rec.hr : null,
    heartIndex: null,
    visceralFat: round2(rec.uvi ?? 0),
    bodyWaterPct: round2(vwc),
    skeletalMuscleMassPct: round2(rosm),
    muscleMass,
    boneMass: round2(rec.bm ?? 0),
    proteinPct: round2(pp),
    bmr: Math.round(rec.bmr ?? 0),
    metabolicAge: Math.round(rec.bodyage ?? 0),
    fatMass,
    moistureContent,
    skeletalMuscleMass,
    muscleRatePct: round2(rom),
    proteinMass,
    obesityScore: ext?.obesityDegree ?? 0,
    fatFreeMass,
    smi: round2(ext?.smi ?? 0),
    bodyScore: round2(ext?.bodyScore ?? 0),
    targetWeight: round2(ext?.targetWeight ?? 0),
    weightControl: round2(ext?.weightControl ?? 0),
    fatControl: round2(ext?.bfmControl ?? 0),
    muscleControl: round2(ext?.ffmControl ?? 0),

    rightArmFatMass: null,
    rightArmFatPct: null,
    rightArmFatLevel: null,
    rightArmMuscleMass: null,
    rightArmMusclePct: null,
    rightArmMuscleLevel: null,
    ...impedances,

    leftArmFatMass: null,
    leftArmFatPct: null,
    leftArmFatLevel: null,
    leftArmMuscleMass: null,
    leftArmMusclePct: null,
    leftArmMuscleLevel: null,

    trunkFatMass: null,
    trunkFatPct: null,
    trunkFatLevel: null,
    trunkMuscleMass: null,
    trunkMusclePct: null,
    trunkMuscleLevel: null,

    rightLegFatMass: null,
    rightLegFatPct: null,
    rightLegFatLevel: null,
    rightLegMuscleMass: null,
    rightLegMusclePct: null,
    rightLegMuscleLevel: null,

    leftLegFatMass: null,
    leftLegFatPct: null,
    leftLegFatLevel: null,
    leftLegMuscleMass: null,
    leftLegMusclePct: null,
    leftLegMuscleLevel: null,
  };
}

export interface SyncFilterOptions {
  selectedSuid: number;
  skipWeightOnly?: boolean;
}

/**
 * Filters a raw weight_list based on selected member suid and weight-only preference.
 */
export function filterFitdaysRecords(
  weightList: WeightRecord[],
  opts: SyncFilterOptions
): WeightRecord[] {
  const skipWeightOnly = opts.skipWeightOnly ?? true;

  return weightList.filter((w) => {
    if (w.is_deleted === 1) return false;
    if (w.suid !== opts.selectedSuid) return false;

    if (skipWeightOnly) {
      if (w.ext_data?.onlyMeasureWeight === "1") return false;
      if (!w.bfr || w.bfr <= 0) return false;
    }

    return true;
  });
}

/**
 * Deduplicates and upserts normalized records into recomp_records for a given user.
 */
export async function upsertFitdaysRecords(
  userId: number,
  records: NormalizedFitdaysRecord[],
  targetDb: typeof db = db
): Promise<{ inserted: number; updated: number; totalProcessed: number }> {
  if (records.length === 0) {
    return { inserted: 0, updated: 0, totalProcessed: 0 };
  }

  // Deduplicate within this batch by minute key
  const batchByMinute = new Map<string, NormalizedFitdaysRecord>();
  for (const rec of records) {
    const normalizedDate = normalizeToMinute(rec.date);
    const key = formatRecordDateKey(normalizedDate);
    if (!key) continue;
    batchByMinute.set(key, { ...rec, date: normalizedDate });
  }

  const deduplicated = Array.from(batchByMinute.values());
  let inserted = 0;
  let updated = 0;

  await targetDb.transaction(async (tx) => {
    const existingRows = await tx.query.recompRecords.findMany({
      where: eq(recompRecords.userId, userId),
    });

    const existingByMinute = new Map<string, (typeof existingRows)[0]>();
    for (const row of existingRows) {
      const key = formatRecordDateKey(row.date);
      if (key) {
        existingByMinute.set(key, row);
      }
    }

    for (const item of deduplicated) {
      const key = formatRecordDateKey(item.date);
      const existing = key ? existingByMinute.get(key) : undefined;

      const payload = {
        weight: item.weight,
        bmi: item.bmi,
        bodyFatPct: item.bodyFatPct,
        subcutaneousFatPct: item.subcutaneousFatPct,
        heartRate: item.heartRate,
        heartIndex: item.heartIndex,
        visceralFat: item.visceralFat,
        bodyWaterPct: item.bodyWaterPct,
        skeletalMuscleMassPct: item.skeletalMuscleMassPct,
        muscleMass: item.muscleMass,
        boneMass: item.boneMass,
        proteinPct: item.proteinPct,
        bmr: item.bmr,
        metabolicAge: item.metabolicAge,
        fatMass: item.fatMass,
        moistureContent: item.moistureContent,
        skeletalMuscleMass: item.skeletalMuscleMass,
        muscleRatePct: item.muscleRatePct,
        proteinMass: item.proteinMass,
        obesityScore: item.obesityScore,
        fatFreeMass: item.fatFreeMass,
        smi: item.smi,
        bodyScore: item.bodyScore,
        targetWeight: item.targetWeight,
        weightControl: item.weightControl,
        fatControl: item.fatControl,
        muscleControl: item.muscleControl,

        rightArmFatMass: item.rightArmFatMass,
        rightArmFatPct: item.rightArmFatPct,
        rightArmFatLevel: item.rightArmFatLevel,
        rightArmMuscleMass: item.rightArmMuscleMass,
        rightArmMusclePct: item.rightArmMusclePct,
        rightArmMuscleLevel: item.rightArmMuscleLevel,
        rightArmImpedanceHigh: item.rightArmImpedanceHigh,
        rightArmImpedanceLow: item.rightArmImpedanceLow,

        leftArmFatMass: item.leftArmFatMass,
        leftArmFatPct: item.leftArmFatPct,
        leftArmFatLevel: item.leftArmFatLevel,
        leftArmMuscleMass: item.leftArmMuscleMass,
        leftArmMusclePct: item.leftArmMusclePct,
        leftArmMuscleLevel: item.leftArmMuscleLevel,
        leftArmImpedanceHigh: item.leftArmImpedanceHigh,
        leftArmImpedanceLow: item.leftArmImpedanceLow,

        trunkFatMass: item.trunkFatMass,
        trunkFatPct: item.trunkFatPct,
        trunkFatLevel: item.trunkFatLevel,
        trunkMuscleMass: item.trunkMuscleMass,
        trunkMusclePct: item.trunkMusclePct,
        trunkMuscleLevel: item.trunkMuscleLevel,
        trunkImpedanceHigh: item.trunkImpedanceHigh,
        trunkImpedanceLow: item.trunkImpedanceLow,

        rightLegFatMass: item.rightLegFatMass,
        rightLegFatPct: item.rightLegFatPct,
        rightLegFatLevel: item.rightLegFatLevel,
        rightLegMuscleMass: item.rightLegMuscleMass,
        rightLegMusclePct: item.rightLegMusclePct,
        rightLegMuscleLevel: item.rightLegMuscleLevel,
        rightLegImpedanceHigh: item.rightLegImpedanceHigh,
        rightLegImpedanceLow: item.rightLegImpedanceLow,

        leftLegFatMass: item.leftLegFatMass,
        leftLegFatPct: item.leftLegFatPct,
        leftLegFatLevel: item.leftLegFatLevel,
        leftLegMuscleMass: item.leftLegMuscleMass,
        leftLegMusclePct: item.leftLegMusclePct,
        leftLegMuscleLevel: item.leftLegMuscleLevel,
        leftLegImpedanceHigh: item.leftLegImpedanceHigh,
        leftLegImpedanceLow: item.leftLegImpedanceLow,
      };

      if (existing) {
        await tx
          .update(recompRecords)
          .set({
            date: item.date,
            ...payload,
          })
          .where(eq(recompRecords.id, existing.id));
        updated++;
      } else {
        await tx.insert(recompRecords).values({
          userId,
          date: item.date,
          starred: false,
          ...payload,
        });
        inserted++;
      }
    }
  });

  return {
    inserted,
    updated,
    totalProcessed: deduplicated.length,
  };
}
