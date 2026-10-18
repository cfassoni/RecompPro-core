/**
 * Scientific resistance training caloric expenditure engine.
 * Implements:
 * - Bi-phasic energy expenditure (Active TUT vs Inter-set Rest Phase)
 * - FFM / Effective Metabolic Weight calibration (Byrne et al., 2005)
 * - 3-Tier biomechanical MET scaling via MovementCategory (Compendium of Physical Activities)
 * - Dynamic RPE and concentric deceleration (+15% TUT at RPE >= 8.5)
 * - Muscle-group weighted non-linear EPOC ((RPE/8)^1.25 * muscleMassFactor + densityBonus)
 * - Counterweight assistance compensation for bodyweight movements (Graviton)
 */

import {
  MovementCategory,
  inferMovementCategory,
  isAssistedBodyweightExercise,
  sanitizeAndResolveEffectiveRpe,
  inferMuscleGroup,
  getMuscleGroupCategory,
} from "./recovery";

export interface CaloricCalculationSet {
  type?: string | null; // normal, warmup, dropset, failure
  reps?: number | null;
  weightKg?: number | null;
  rpe?: number | null;
  durationSeconds?: number | null;
}

export interface CaloricCalculationExercise {
  title?: string | null;
  equipment?: string | null;
  notes?: string | null;
  primaryMuscleGroup?: string | null;
  sets: CaloricCalculationSet[];
}

export interface CaloricCalculationParams {
  weightKg: number;
  fatFreeMassKg?: number | null;
  fatMassKg?: number | null;
  durationSeconds: number;
  exercises: CaloricCalculationExercise[];
}

export interface CaloricCalculationResult {
  sessionKcal: number; // Active TUT + Rest phase
  epocKcal: number; // Non-linear EPOC afterburn (~24h protein synthesis)
  totalKcal: number; // sessionKcal + epocKcal
  activeKcal: number; // Strictly active muscle contraction
  restKcal: number; // Rest phase between sets
  activeSeconds: number;
  restSeconds: number;
  avgRpe: number | null;
  epocPercentage: number; // E.g., 8.5%
}

/**
 * Baseline MET for muscle group (backward-compatibility wrapper).
 */
export function getBaseMetForMuscleGroup(muscleGroup?: string | null): number {
  if (!muscleGroup) return 6.5;
  const normalized = muscleGroup.toLowerCase().trim();

  if (
    normalized.includes("leg") ||
    normalized.includes("quad") ||
    normalized.includes("glute") ||
    normalized.includes("hamstring") ||
    normalized.includes("thigh")
  ) {
    return 10.0;
  }

  if (
    normalized.includes("chest") ||
    normalized.includes("back") ||
    normalized.includes("lats") ||
    normalized.includes("shoulder") ||
    normalized.includes("trap") ||
    normalized.includes("deltoid")
  ) {
    return 7.5;
  }

  return 5.0;
}

/**
 * 3-Tier Biomechanical Dynamic MET resolution.
 */
export function resolveSetDynamicMet(
  category: MovementCategory,
  setRpe: number,
  isWarmup = false
): number {
  if (isWarmup) return 2.8;

  if (category === "free_weight_compound") {
    if (setRpe >= 8.5) return 6.0;
    if (setRpe >= 7.0) return 5.2;
    return 4.5;
  }

  if (category === "machine_cable_compound") {
    if (setRpe >= 8.5) return 5.5;
    if (setRpe >= 7.0) return 4.6;
    return 4.0;
  }

  // isolation_small
  if (setRpe >= 8.5) return 4.5;
  if (setRpe >= 7.0) return 3.5;
  return 3.0;
}

/**
 * RPE Effort Multiplier (Helms/Zourdos RIR scale: 5 to 10).
 */
export function getRpeMultiplier(rpe?: number | null): number {
  if (rpe === null || rpe === undefined || isNaN(rpe) || rpe <= 0) {
    return 1.15; // Fallback: RPE 7.5
  }
  const clampedRpe = Math.min(10, Math.max(5, rpe));
  return Math.round((0.7 + (clampedRpe / 10) * 0.6) * 100) / 100;
}

/**
 * Calculates Effective Metabolic Weight (Weff) in kg (Byrne et al., 2005).
 */
export function calculateEffectiveWeight(
  weightKg: number,
  fatFreeMassKg?: number | null,
  fatMassKg?: number | null
): number {
  if (fatFreeMassKg && fatFreeMassKg > 0) {
    const fm =
      fatMassKg && fatMassKg > 0
        ? fatMassKg
        : Math.max(0, weightKg - fatFreeMassKg);
    return fatFreeMassKg + 0.2 * fm;
  }
  return weightKg * 0.85;
}

/**
 * Unified resistance training caloric expenditure calculator.
 */
export function calculateWorkoutCalories(
  params: CaloricCalculationParams
): CaloricCalculationResult {
  const { weightKg, fatFreeMassKg, fatMassKg, durationSeconds, exercises } =
    params;
  const effectiveWeight = calculateEffectiveWeight(
    weightKg,
    fatFreeMassKg,
    fatMassKg
  );

  let activeSeconds = 0;
  let activeKcal = 0;
  let totalWorkingVolume = 0;
  let totalWorkingSets = 0;
  let largeGroupWorkingSets = 0;
  let sumEffectiveRpe = 0;

  for (const ex of exercises) {
    const movCategory = inferMovementCategory(
      ex.title,
      ex.equipment,
      ex.primaryMuscleGroup
    );
    const isAssisted = isAssistedBodyweightExercise(ex.title, ex.equipment);
    const muscleGroup = inferMuscleGroup(ex.primaryMuscleGroup, ex.title);
    const isLargeMuscle = muscleGroup
      ? getMuscleGroupCategory(muscleGroup) === "large"
      : movCategory !== "isolation_small";

    const rpeRes = sanitizeAndResolveEffectiveRpe(
      ex.sets,
      movCategory,
      ex.notes,
      isAssisted
    );

    let workingIndex = 0;
    for (const set of ex.sets) {
      if (set.type === "warmup") continue;

      const reps = set.reps ?? 0;
      const setEffectiveRpe =
        rpeRes.sanitizedSetRpes?.[workingIndex] ?? rpeRes.effectiveRpe;
      workingIndex++;

      // Concentric deceleration: +15% TUT per rep at high intensity (RPE >= 8.5)
      let tutSeconds =
        set.durationSeconds && set.durationSeconds > 0
          ? set.durationSeconds
          : reps * (setEffectiveRpe >= 8.5 ? 4.025 : 3.5);

      if (tutSeconds <= 0 && reps > 0) {
        tutSeconds = reps * 3.5;
      }
      if (tutSeconds <= 0) continue;

      totalWorkingSets++;
      if (isLargeMuscle) {
        largeGroupWorkingSets++;
      }
      sumEffectiveRpe += setEffectiveRpe;
      activeSeconds += tutSeconds;

      const setMet = resolveSetDynamicMet(movCategory, setEffectiveRpe, false);

      // kcal = MET * 3.5 * Weff / 200 * (tutSeconds / 60)
      const setKcal =
        (setMet * 3.5 * effectiveWeight * (tutSeconds / 60)) / 200;
      activeKcal += setKcal;

      // Effective load for tonnage
      let effectiveLoad = set.weightKg ?? 0;
      if (isAssisted) {
        effectiveLoad = Math.max(10, weightKg - effectiveLoad);
      }
      totalWorkingVolume += effectiveLoad * Math.max(1, reps);
    }
  }

  activeSeconds = Math.min(durationSeconds, activeSeconds);
  const restSeconds = Math.max(0, durationSeconds - activeSeconds);

  // Rest phase: Acute recovery at 2.2 METs
  const restMet = 2.2;
  const restKcal = (restMet * 3.5 * effectiveWeight * (restSeconds / 60)) / 200;

  const roundedActive = Math.round(activeKcal * 10) / 10;
  const roundedRest = Math.round(restKcal * 10) / 10;
  const sessionKcal = Math.round((roundedActive + roundedRest) * 10) / 10;

  const avgRpe =
    totalWorkingSets > 0
      ? Math.round((sumEffectiveRpe / totalWorkingSets) * 10) / 10
      : null;

  // Non-linear EPOC calculation
  const safeAvgRpe = avgRpe ?? 7.5;
  const epocRpeMultiplier = Math.pow(
    Math.min(10, Math.max(5, safeAvgRpe)) / 8,
    1.25
  );

  const largeMuscleRatio =
    totalWorkingSets > 0 ? largeGroupWorkingSets / totalWorkingSets : 0.5;
  const muscleMassFactor = 0.75 + 0.25 * largeMuscleRatio;

  const durationMinutes = Math.max(1, durationSeconds / 60);
  const densityKgPerMin = totalWorkingVolume / durationMinutes;
  const densityBonus = Math.min(1, densityKgPerMin / 250) * 0.035;

  const epocRate = Math.min(
    0.13,
    Math.max(
      0.03,
      0.06 * epocRpeMultiplier * muscleMassFactor + densityBonus
    )
  );

  const epocKcal = Math.round(activeKcal * epocRate * 10) / 10;
  const totalKcal = Math.round((sessionKcal + epocKcal) * 10) / 10;

  return {
    sessionKcal,
    epocKcal,
    totalKcal,
    activeKcal: roundedActive,
    restKcal: roundedRest,
    activeSeconds: Math.round(activeSeconds),
    restSeconds: Math.round(restSeconds),
    avgRpe,
    epocPercentage: Math.round(epocRate * 1000) / 10,
  };
}
