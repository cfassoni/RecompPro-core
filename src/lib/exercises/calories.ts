/**
 * Scientific resistance training caloric expenditure engine.
 * Implements:
 * - Bi-phasic energy expenditure (Active TUT vs Inter-set Rest Phase)
 * - FFM / Effective Metabolic Weight calibration (Byrne et al., 2005)
 * - Muscle-group specific MET scaling (2024/2011 Compendium of Physical Activities)
 * - RPE effort scaling (Helms/Zourdos RIR scale)
 * - Prolonged EPOC afterburn (~24h recovery & protein synthesis: Schuenke 2002; Paoli 2012)
 */

export interface CaloricCalculationSet {
  type?: string | null; // normal, warmup, dropset, failure
  reps?: number | null;
  weightKg?: number | null;
  rpe?: number | null;
  durationSeconds?: number | null;
}

export interface CaloricCalculationExercise {
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
  sessionKcal: number;    // Intra-treino (TUT ativo + pausas EPOC agudo)
  epocKcal: number;       // Afterburn prolongado (~24h reparação/síntese proteica)
  totalKcal: number;      // sessionKcal + epocKcal
  activeKcal: number;     // Parcela estritamente sob tensão
  restKcal: number;       // Parcela do descanso intra-sessão
  activeSeconds: number;
  restSeconds: number;
  avgRpe: number | null;
  epocPercentage: number; // Ex: 12.5%
}

/**
 * Returns baseline MET for active muscle contraction based on primary muscle group.
 * Compendium of Physical Activities codes:
 * - Legs / Glutes / Back multi-joint compound: 10.0 METs
 * - Chest / Shoulders / Upper compound: 7.5 METs
 * - Arms / Calves / Isolation: 5.0 METs
 */
export function getBaseMetForMuscleGroup(muscleGroup?: string | null): number {
  if (!muscleGroup) return 6.5;
  const normalized = muscleGroup.toLowerCase().trim();

  // Multi-joint lower body & posterior chain
  if (
    normalized.includes("leg") ||
    normalized.includes("quad") ||
    normalized.includes("glute") ||
    normalized.includes("hamstring") ||
    normalized.includes("thigh")
  ) {
    return 10.0;
  }

  // Multi-joint upper body & torso
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

  // Isolation & smaller muscle groups (arms, calves, abs, forearms)
  return 5.0;
}

/**
 * RPE Effort Multiplier (Helms/Zourdos RIR scale: 5 to 10)
 * Scaled continuously around standard RPE 7.5.
 */
export function getRpeMultiplier(rpe?: number | null): number {
  if (rpe === null || rpe === undefined || isNaN(rpe) || rpe <= 0) {
    return 1.15; // Fallback: RPE 7.5
  }
  const clampedRpe = Math.min(10, Math.max(5, rpe));
  return Math.round((0.7 + (clampedRpe / 10) * 0.6) * 100) / 100;
}

/**
 * Calculates Effective Metabolic Weight (Weff) in kg to prevent caloric overestimation
 * in individuals with obesity (Byrne et al., 2005).
 */
export function calculateEffectiveWeight(
  weightKg: number,
  fatFreeMassKg?: number | null,
  fatMassKg?: number | null
): number {
  if (fatFreeMassKg && fatFreeMassKg > 0) {
    const fm = fatMassKg && fatMassKg > 0 ? fatMassKg : Math.max(0, weightKg - fatFreeMassKg);
    return fatFreeMassKg + 0.2 * fm;
  }
  // Population fallback if no bioimpedance scan exists: assume 85% effective mass
  return weightKg * 0.85;
}

export function calculateWorkoutCalories(params: CaloricCalculationParams): CaloricCalculationResult {
  const { weightKg, fatFreeMassKg, fatMassKg, durationSeconds, exercises } = params;
  const effectiveWeight = calculateEffectiveWeight(weightKg, fatFreeMassKg, fatMassKg);

  let activeSeconds = 0;
  let activeKcal = 0;
  let totalVolumeRpe = 0;
  let totalWorkingVolume = 0;
  let hasLegOrBackCompound = false;
  let totalWorkingSets = 0;

  for (const ex of exercises) {
    const baseMet = getBaseMetForMuscleGroup(ex.primaryMuscleGroup);
    if (baseMet >= 7.5) {
      hasLegOrBackCompound = true;
    }

    for (const set of ex.sets) {
      if (set.type === "warmup") continue;

      const reps = set.reps ?? 0;
      // Cadence: 3.5s per rep if not explicitly provided
      const tutSeconds =
        set.durationSeconds && set.durationSeconds > 0
          ? set.durationSeconds
          : reps * 3.5;

      if (tutSeconds <= 0) continue;

      totalWorkingSets++;
      activeSeconds += tutSeconds;

      const rpeMult = getRpeMultiplier(set.rpe);
      const activeMet = baseMet * rpeMult;

      // kcal = MET * 3.5 * Weff / 200 * (tutSeconds / 60)
      const setKcal = (activeMet * 3.5 * effectiveWeight * (tutSeconds / 60)) / 200;
      activeKcal += setKcal;

      // Track RPE weighted by set volume (or reps)
      const setVol = (set.weightKg ?? 1) * Math.max(1, reps);
      if (set.rpe && set.rpe > 0) {
        totalVolumeRpe += set.rpe * setVol;
        totalWorkingVolume += setVol;
      }
    }
  }

  // Safe clamping of active seconds vs duration
  activeSeconds = Math.min(durationSeconds, activeSeconds);
  const restSeconds = Math.max(0, durationSeconds - activeSeconds);

  // Rest phase: Acute EPOC recovery at 2.2 METs
  const restMet = 2.2;
  const restKcal = (restMet * 3.5 * effectiveWeight * (restSeconds / 60)) / 200;

  const roundedActive = Math.round(activeKcal * 10) / 10;
  const roundedRest = Math.round(restKcal * 10) / 10;
  const sessionKcal = Math.round((roundedActive + roundedRest) * 10) / 10;

  // Average session RPE
  const avgRpe =
    totalWorkingVolume > 0
      ? Math.round((totalVolumeRpe / totalWorkingVolume) * 10) / 10
      : totalWorkingSets > 0
      ? 7.5
      : null;

  // Prolonged EPOC afterburn (~24h recovery & muscle protein synthesis)
  // Scaled by session RPE and muscle mass involvement (Schuenke 2002, Paoli 2012)
  let epocFactor = 0.1; // 10% base
  if (avgRpe) {
    epocFactor *= avgRpe / 7.5;
  }
  if (hasLegOrBackCompound) {
    epocFactor *= 1.2;
  }
  // Clamp EPOC factor between 6% and 18%
  const clampedEpocFactor = Math.min(0.18, Math.max(0.06, epocFactor));
  const epocKcal = Math.round(sessionKcal * clampedEpocFactor * 10) / 10;
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
    epocPercentage: Math.round(clampedEpocFactor * 1000) / 10,
  };
}
