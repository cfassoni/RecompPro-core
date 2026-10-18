/**
 * Scientific muscle recovery readiness, progressive overload, and double progression engine.
 * Implements:
 * - Localized myofibrillar protein synthesis (MPS) & tissue repair kinetics (Schoenfeld 2016, 2021; Damas 2016)
 * - Biological personalization: Sex differences in fatigability/recovery (Hunter 2014, 2020)
 * - Biological personalization: Age-related collagen turnover & anabolic resistance (Fell & Williams 2008; Fernandes et al. 2025)
 * - Caloric state (deficit/surplus/maintenance) and sleep quality modulation
 * - Static Double Progression prescription and RPE inference
 * - Dynamic RPE sanitization and physiological monotonicity filtering
 * - Assisted bodyweight (Graviton) inverted progression handling
 * - Historical progression tracking & PR gold medal detection
 */

export type MuscleGroupKey =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings_glutes"
  | "calves"
  | "core";

export type MuscleGroupCategory = "large" | "small";

export type MovementCategory =
  | "free_weight_compound"
  | "machine_cable_compound"
  | "isolation_small";

export interface RepBracketConfig {
  minReps: number;
  maxReps: number;
  category: MovementCategory;
}

export const DEFAULT_REP_BRACKETS: Record<
  MovementCategory,
  { minReps: number; maxReps: number }
> = {
  free_weight_compound: { minReps: 6, maxReps: 8 },
  machine_cable_compound: { minReps: 8, maxReps: 12 },
  isolation_small: { minReps: 10, maxReps: 15 },
};

export interface RpeSessionData {
  mode: "rpe";
  avgRpe: number;
}

export interface DoubleProgressionSessionData {
  mode: "double_progression";
  completedReps: number[];
  minRepsTarget: number;
  maxRepsTarget: number;
}

export type WorkoutSessionData = RpeSessionData | DoubleProgressionSessionData;

export interface UserProfileBiologicalFactors {
  gender?: "male" | "female" | string | null;
  birthday?: string | null; // YYYY-MM-DD
  caloricState?: "deficit" | "surplus" | "maintenance" | null;
  sleepQualityScore?: number | null; // 0.6 to 1.2
  reportedSoreness?: number | null; // 0 to 10
}

export type UserRecoveryProfile = UserProfileBiologicalFactors;

export type ReadinessStatus =
  | "READY"
  | "RECOVERING_TRAINABLE"
  | "FATIGUED_REST_REQUIRED";

export interface ReadinessEvaluationResult {
  status: ReadinessStatus;
  hoursElapsed: number;
  estimatedTotalHours: number;
  completionPercentage: number;
  recommendedVolumeMultiplier: 1.0 | 0.8 | 0.0;
}

export type ProgressionAction =
  | "INCREASE_LOAD"
  | "MAINTAIN_LOAD_PUSH_REPS"
  | "REDUCE_LOAD_RESET";

export interface NextSessionPrescription {
  action: ProgressionAction;
  nextLoadKg: number;
  targetRepBracket: { minReps: number; maxReps: number };
  reasoning: string;
  isAssisted?: boolean;
}

export interface EffectiveRpeResolution {
  effectiveRpe: number;
  rawAvgRpe: number | null;
  objectiveRpe: number;
  source: "explicit" | "explicit_sanitized" | "double_progression";
  wasSanitized: boolean;
  sanitizedSetRpes?: number[];
}

export interface MuscleRecoveryState {
  group: MuscleGroupKey;
  muscleCategory: MuscleGroupCategory;
  lastTrainedAt: Date | null;
  hoursElapsed: number | null;
  recommendedRecoveryHours: number;
  readinessPercentage: number; // 0 to 100
  status: "ready" | "recovering" | "exhausted";
  clinicalStatus: ReadinessStatus;
  recommendedVolumeMultiplier: 1.0 | 0.8 | 0.0;
  lastSessionSets: number;
  lastSessionVolumeKg: number;
  lastSessionAvgRpe: number | null;
}

export interface ReadinessSummary {
  lastWorkoutAt: Date | null;
  hoursSinceLastWorkout: number | null;
  muscles: Record<MuscleGroupKey, MuscleRecoveryState>;
  readyGroups: MuscleGroupKey[];
  recoveringGroups: MuscleGroupKey[];
  recommendationKey: string;
}

export interface SetProgressionInfo {
  isProgression: boolean;
  progressionType: "weight_pr" | "reps_pr" | "1rm_pr" | null;
  deltaWeightKg: number | null;
  deltaReps: number | null;
  previousWeightKg: number | null;
  previousReps: number | null;
  est1RmKg?: number | null;
  isAssisted?: boolean;
}

export interface ExerciseProgressionSummary {
  exerciseTitle: string;
  exerciseTemplateId: string | null;
  hasProgression: boolean;
  progressionCount: number;
  bestProgression: SetProgressionInfo | null;
  isAssisted: boolean;
  setsProgression: SetProgressionInfo[];
  nextPrescription: NextSessionPrescription | null;
}

export interface WorkoutProgressionSummary {
  workoutId: string;
  hasProgression: boolean;
  totalPrCount: number;
  exercises: ExerciseProgressionSummary[];
}

export interface PeriodExerciseProgressionItem {
  canonicalKey: string;
  title: string;
  primaryMuscleGroup: string | null;
  isAssisted: boolean;
  startWeightKg: number;
  currentWeightKg: number;
  deltaWeightKg: number;
  pctChange: number;
  bestWeightKg: number;
  bestRepsAtWeight: number;
  bestEst1RmKg: number;
  prCountInPeriod: number;
  lastProgressedAt: string;
}

/**
 * Calculates user age in full years from birthday string (YYYY-MM-DD).
 */
export function calculateAgeInYears(
  birthdayStr?: string | null,
  referenceDate = new Date()
): number | null {
  if (!birthdayStr) return null;
  const parts = birthdayStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [birthYear, birthMonth, birthDay] = parts;

  let age = referenceDate.getFullYear() - birthYear;
  const currentMonth = referenceDate.getMonth() + 1; // 1-12
  const currentDay = referenceDate.getDate();

  if (
    currentMonth < birthMonth ||
    (currentMonth === birthMonth && currentDay < birthDay)
  ) {
    age--;
  }
  return age >= 0 ? age : null;
}

/**
 * Categorizes a muscle group into Large vs Small.
 * Large: chest, back, quads, hamstrings/glutes
 * Small: shoulders, biceps, triceps, calves, core
 */
export function getMuscleGroupCategory(group: MuscleGroupKey): MuscleGroupCategory {
  if (
    group === "shoulders" ||
    group === "biceps" ||
    group === "triceps" ||
    group === "calves" ||
    group === "core"
  ) {
    return "small";
  }
  return "large";
}

/**
 * Detects if an exercise is an assisted bodyweight movement (e.g., Graviton / Assisted Pull Up / Dip).
 * In assisted movements, lowering the weight counterweight represents positive progression.
 */
export function isAssistedBodyweightExercise(
  title?: string | null,
  equipment?: string | null
): boolean {
  const t = (title || "").toLowerCase();
  const eq = (equipment || "").toLowerCase();

  return (
    t.includes("assisted") ||
    t.includes("assistid") ||
    t.includes("graviton") ||
    t.includes("gravitron") ||
    eq.includes("assisted") ||
    eq.includes("graviton")
  );
}

/**
 * Infers biomechanical movement category (3-tier).
 */
export function inferMovementCategory(
  exerciseTitle?: string | null,
  equipment?: string | null,
  primaryMuscle?: string | null
): MovementCategory {
  const t = (exerciseTitle || "").toLowerCase();
  const eq = (equipment || "").toLowerCase();
  const pm = (primaryMuscle || "").toLowerCase();

  // Small / Isolation muscles
  if (
    pm.includes("bicep") ||
    pm.includes("tricep") ||
    pm.includes("calf") ||
    pm.includes("calves") ||
    pm.includes("forearm") ||
    pm.includes("abs") ||
    t.includes("lateral raise") ||
    t.includes("elevação lateral") ||
    t.includes("front raise") ||
    t.includes("elevação frontal") ||
    t.includes("curl") ||
    t.includes("rosca") ||
    t.includes("pushdown") ||
    t.includes("extension") ||
    t.includes("extensora") ||
    t.includes("flexora") ||
    t.includes("fly") ||
    t.includes("crucifixo") ||
    t.includes("crossover") ||
    t.includes("cross over") ||
    t.includes("skull crusher") ||
    t.includes("tríceps testa") ||
    t.includes("panturrilha") ||
    t.includes("face pull")
  ) {
    return "isolation_small";
  }

  // Machine / Cable compound
  if (
    eq.includes("machine") ||
    eq.includes("cable") ||
    eq.includes("smith") ||
    t.includes("leg press") ||
    t.includes("legpress") ||
    t.includes("hack") ||
    t.includes("lat pulldown") ||
    t.includes("puxada") ||
    t.includes("seated row") ||
    t.includes("remada baixa") ||
    t.includes("chest press") ||
    t.includes("supino máquina") ||
    t.includes("shoulder press machine") ||
    t.includes("desenvolvimento máquina") ||
    t.includes("smith") ||
    t.includes("polia") ||
    t.includes("graviton")
  ) {
    return "machine_cable_compound";
  }

  // Free-weight compound
  return "free_weight_compound";
}

/**
 * Resolves the target rep bracket [minReps, maxReps] using a 2-tier approach:
 * 1. Explicit notes parsing (e.g. "6-10", "8 a 12", "15-20 reps")
 * 2. Adaptive zoning based on actual peak reps completed and movement category
 */
export function resolveAdaptiveRepBracket(
  movementCategory: MovementCategory,
  completedReps: number[] = [],
  notes?: string | null
): { minReps: number; maxReps: number } {
  // Level 1: Parse explicit notes if provided
  if (notes) {
    const match = notes.match(/\b(\d{1,2})\s*(?:[-–~]|a|to)\s*(\d{1,2})\b/i);
    if (match) {
      const min = parseInt(match[1], 10);
      const max = parseInt(match[2], 10);
      if (min >= 1 && max > min && max <= 50) {
        return { minReps: min, maxReps: max };
      }
    }
  }

  // Level 2: Adaptive zoning from observed reps
  const validReps = completedReps.filter((r) => r > 0);
  if (validReps.length === 0) {
    return DEFAULT_REP_BRACKETS[movementCategory];
  }

  const maxSetReps = Math.max(...validReps);

  if (maxSetReps <= 6) {
    return { minReps: 4, maxReps: 6 };
  }
  if (maxSetReps <= 8 && movementCategory === "free_weight_compound") {
    return { minReps: 6, maxReps: 8 };
  }
  if (maxSetReps <= 10 && movementCategory !== "isolation_small") {
    return { minReps: 6, maxReps: 10 };
  }
  if (maxSetReps <= 12) {
    return { minReps: 8, maxReps: 12 };
  }
  if (maxSetReps <= 15) {
    return { minReps: 10, maxReps: 15 };
  }
  if (maxSetReps <= 20) {
    return { minReps: 15, maxReps: 20 };
  }
  return { minReps: 20, maxReps: 25 };
}

/**
 * Derives effective session RPE from completed reps under Double Progression.
 * Implements Section 3.2 of the specification.
 */
export function deriveRpeFromDoubleProgression(
  session: DoubleProgressionSessionData
): number {
  const { completedReps, minRepsTarget, maxRepsTarget } = session;

  if (!completedReps || completedReps.length === 0) {
    return 8.0;
  }

  // If all completed sets reached or exceeded the ceiling -> RPE 9.5 (unlocked progression)
  const allHitMax = completedReps.every((r) => r >= maxRepsTarget);
  if (allHitMax) {
    return 9.5;
  }

  const firstSetReps = completedReps[0];
  const lastSetReps = completedReps[completedReps.length - 1];
  const repDrop = firstSetReps - lastSetReps;

  // Severe fatigue drop or fell below bracket floor -> RPE 9.0
  if (repDrop >= 3 || lastSetReps < minRepsTarget) {
    return 9.0;
  }

  // Moderate fatigue drop -> RPE 8.5
  if (repDrop >= 1) {
    return 8.5;
  }

  // Flat performance below ceiling -> RPE 8.0
  return 8.0;
}

/**
 * Sanitizes and resolves effective RPE for an exercise session:
 * - Maps Hevy "failure" set tags to objective RPE 10.0
 * - Applies Backward Failure Pass (anchors set prior to failure)
 * - Applies Forward Monotonicity Pass (effort cannot drop under constant/increasing load)
 * - Computes generalized power mean (p = 1.25) to avoid Jensen's inequality dilution
 * - Cross-checks with Double Progression objective floor
 */
export function sanitizeAndResolveEffectiveRpe(
  sets: Array<{
    type?: string | null;
    rpe?: number | null;
    weightKg?: number | null;
    reps?: number | null;
  }>,
  movementCategory: MovementCategory,
  notes?: string | null,
  isAssisted = false
): EffectiveRpeResolution {
  const workingSets = sets.filter((s) => s.type !== "warmup");
  if (workingSets.length === 0) {
    return {
      effectiveRpe: 7.5,
      rawAvgRpe: null,
      objectiveRpe: 7.5,
      source: "double_progression",
      wasSanitized: false,
      sanitizedSetRpes: [],
    };
  }

  const completedReps = workingSets
    .map((s) => s.reps ?? 0)
    .filter((r) => r > 0);

  const bracket = resolveAdaptiveRepBracket(movementCategory, completedReps, notes);
  const objectiveRpe = deriveRpeFromDoubleProgression({
    mode: "double_progression",
    completedReps,
    minRepsTarget: bracket.minReps,
    maxRepsTarget: bracket.maxReps,
  });

  const rawRpes = workingSets.map((s) => {
    if (s.type === "failure") return 10.0;
    if (typeof s.rpe === "number" && s.rpe > 0 && !isNaN(s.rpe)) {
      return Math.min(10, Math.max(5, s.rpe));
    }
    return null;
  });

  const hasAnyExplicit = rawRpes.some((r) => r !== null);
  if (!hasAnyExplicit) {
    return {
      effectiveRpe: objectiveRpe,
      rawAvgRpe: null,
      objectiveRpe,
      source: "double_progression",
      wasSanitized: false,
      sanitizedSetRpes: workingSets.map(() => objectiveRpe),
    };
  }

  // Pre-fill missing RPEs with objective or neighboring values
  const filledRpes = rawRpes.map((r) => (r !== null ? r : objectiveRpe));
  const sanitized = [...filledRpes];
  let wasSanitized = false;

  // 1. Backward Failure Pass (Set prior to failure RPE >= 9.5 cannot be arbitrarily low)
  for (let i = sanitized.length - 1; i > 0; i--) {
    const currentRpe = sanitized[i];
    const prevRpe = sanitized[i - 1];
    const currentWeight = workingSets[i].weightKg ?? 0;
    const prevWeight = workingSets[i - 1].weightKg ?? 0;
    const currentReps = workingSets[i].reps ?? 0;
    const prevReps = workingSets[i - 1].reps ?? 0;

    const isSameOrHarderLoad = isAssisted
      ? prevWeight <= currentWeight
      : prevWeight >= currentWeight;

    if (currentRpe >= 9.5 && isSameOrHarderLoad && prevReps >= currentReps - 1) {
      const anchoredFloor = currentRpe - 1.0;
      if (prevRpe < anchoredFloor) {
        sanitized[i - 1] = Math.min(10, anchoredFloor);
        wasSanitized = true;
      }
    }
  }

  // 2. Forward Monotonicity Pass
  for (let i = 1; i < sanitized.length; i++) {
    const prevRpe = sanitized[i - 1];
    const currentRpe = sanitized[i];
    const prevWeight = workingSets[i - 1].weightKg ?? 0;
    const currentWeight = workingSets[i].weightKg ?? 0;
    const prevReps = workingSets[i - 1].reps ?? 0;
    const currentReps = workingSets[i].reps ?? 0;

    const isSameOrHarderLoad = isAssisted
      ? currentWeight <= prevWeight
      : currentWeight >= prevWeight;

    if (isSameOrHarderLoad && currentReps >= prevReps && currentRpe < prevRpe) {
      sanitized[i] = prevRpe;
      wasSanitized = true;
    }
  }

  // 3. Power Mean p = 1.25 (Equivalent Exponent)
  const powerSum = sanitized.reduce(
    (acc, val) => acc + Math.pow(Math.min(10, Math.max(5, val)) / 8, 1.25),
    0
  );
  const powerMean = 8 * Math.pow(powerSum / sanitized.length, 1 / 1.25);

  // 4. Objective Consistency Floor
  const finalEffective = Math.min(
    10.0,
    Math.max(5.0, Math.max(powerMean, objectiveRpe - 0.5))
  );

  const rawValid = rawRpes.filter((r): r is number => r !== null);
  const rawAvgRpe =
    rawValid.length > 0
      ? Math.round((rawValid.reduce((a, b) => a + b, 0) / rawValid.length) * 10) / 10
      : null;

  return {
    effectiveRpe: Math.round(finalEffective * 10) / 10,
    rawAvgRpe,
    objectiveRpe,
    source: wasSanitized ? "explicit_sanitized" : "explicit",
    wasSanitized,
    sanitizedSetRpes: sanitized,
  };
}

/**
 * Unified Recovery Hours Engine.
 * Implements Section 3.1 & Section 4 of the specification.
 */
export function calculateUnifiedRecoveryHours(
  workingSets: number,
  sessionData: WorkoutSessionData,
  profile?: UserRecoveryProfile,
  muscleCategory: MuscleGroupCategory = "large"
): number {
  if (workingSets <= 0) {
    return 0; // Acceptance Criterion #1
  }

  const safeSets = Math.max(1, workingSets);

  let rawRpe: number;
  if (sessionData.mode === "rpe") {
    rawRpe = sessionData.avgRpe;
  } else {
    rawRpe = deriveRpeFromDoubleProgression(sessionData);
  }

  const clampedRpe = Math.min(10, Math.max(5, rawRpe));

  // Category parameters
  const isSmall = muscleCategory === "small";
  const baseFloor = isSmall ? 18 : 24;
  const volumeWeight = isSmall ? 2.2 : 3.0;
  const minCap = isSmall ? 20 : 24;
  const maxCap = isSmall ? 60 : 72;

  // Non-linear volume scaling & exponential effort
  const volumeHours = Math.pow(safeSets, 0.85) * volumeWeight;
  const rpeMultiplier = Math.pow(clampedRpe / 8, 1.25);
  const rawSessionHours = Math.min(
    maxCap,
    Math.max(minCap, baseFloor + volumeHours * rpeMultiplier)
  );

  // Biological & Systemic Modifiers
  const kSex = profile?.gender === "female" ? 0.9 : 1.0;

  // Safe age scaling (resilient to NaN / invalid dates - Acceptance Criterion #2)
  let kAge = 1.0;
  if (profile?.birthday) {
    const age = calculateAgeInYears(profile.birthday);
    if (age !== null && !isNaN(age)) {
      if (age > 40 && age <= 65) {
        kAge = 1.0 + (age - 40) * 0.008;
      } else if (age > 65) {
        kAge = 1.2;
      }
    }
  }

  // Caloric modifier
  let kCalorie = 1.0;
  if (profile?.caloricState === "deficit") {
    kCalorie = 1.15;
  } else if (profile?.caloricState === "surplus") {
    kCalorie = 0.95;
  }

  // Sleep quality divisor (clamped 0.6 to 1.2)
  const sleepDivisor = Math.min(
    1.2,
    Math.max(0.6, profile?.sleepQualityScore ?? 1.0)
  );

  const finalHours = (rawSessionHours * kSex * kAge * kCalorie) / sleepDivisor;
  return Math.round(finalHours * 10) / 10;
}

/**
 * Backward compatibility wrapper for calculateRecoveryWindowHours.
 */
export function calculateRecoveryWindowHours(
  sets: number,
  avgRpe: number | null,
  biologicalFactors?: UserProfileBiologicalFactors,
  muscleCategory: MuscleGroupCategory = "large"
): number {
  if (sets <= 0) return 24;
  const hours = calculateUnifiedRecoveryHours(
    sets,
    { mode: "rpe", avgRpe: avgRpe ?? 7.5 },
    biologicalFactors,
    muscleCategory
  );
  return Math.min(72, Math.max(24, Math.round(hours)));
}

/**
 * Evaluates muscle readiness and returns clinical status, percentage, and recommended volume multiplier.
 * Implements Section 3.3 of the specification.
 */
export function evaluateMuscleReadiness(
  hoursElapsed: number,
  estimatedRecoveryHours: number,
  reportedSoreness = 0
): ReadinessEvaluationResult {
  if (estimatedRecoveryHours <= 0) {
    return {
      status: "READY",
      hoursElapsed,
      estimatedTotalHours: 0,
      completionPercentage: 100,
      recommendedVolumeMultiplier: 1.0,
    };
  }

  const ratio = hoursElapsed / estimatedRecoveryHours;
  const completionPercentage = Math.min(
    100,
    Math.max(0, Math.round(ratio * 100))
  );

  // Severe soreness override (>7) or <60% time ratio
  if (reportedSoreness > 7 || ratio < 0.6) {
    return {
      status: "FATIGUED_REST_REQUIRED",
      hoursElapsed,
      estimatedTotalHours: estimatedRecoveryHours,
      completionPercentage,
      recommendedVolumeMultiplier: 0.0,
    };
  }

  // 75% threshold gate with mild or absent DOMS (Acceptance Criterion #5)
  if (ratio >= 0.75 && reportedSoreness <= 4) {
    return {
      status: "READY",
      hoursElapsed,
      estimatedTotalHours: estimatedRecoveryHours,
      completionPercentage,
      recommendedVolumeMultiplier: 1.0,
    };
  }

  // Trainable with moderated volume
  if (ratio >= 0.85 && reportedSoreness <= 7) {
    return {
      status: "RECOVERING_TRAINABLE",
      hoursElapsed,
      estimatedTotalHours: estimatedRecoveryHours,
      completionPercentage,
      recommendedVolumeMultiplier: 0.8,
    };
  }

  if (ratio >= 0.6 && ratio < 0.75) {
    return {
      status: "RECOVERING_TRAINABLE",
      hoursElapsed,
      estimatedTotalHours: estimatedRecoveryHours,
      completionPercentage,
      recommendedVolumeMultiplier: 0.8,
    };
  }

  return {
    status: "RECOVERING_TRAINABLE",
    hoursElapsed,
    estimatedTotalHours: estimatedRecoveryHours,
    completionPercentage,
    recommendedVolumeMultiplier: 0.8,
  };
}

/**
 * Prescribes next load and rep target under Static Double Progression.
 * Implements Section 3.4 of the specification with inverted polarity support for Graviton.
 */
export function prescribeNextLoadStaticDoubleProgression(
  currentLoadKg: number,
  minReps: number,
  maxReps: number,
  completedReps: number[],
  loadIncrementKg = 2.5,
  isAssisted = false
): NextSessionPrescription {
  const targetRepBracket = { minReps, maxReps };

  if (!completedReps || completedReps.length === 0) {
    return {
      action: "MAINTAIN_LOAD_PUSH_REPS",
      nextLoadKg: currentLoadKg,
      targetRepBracket,
      reasoning: "Sem dados suficientes de repetições nesta sessão.",
      isAssisted,
    };
  }

  const allHitMax = completedReps.every((r) => r >= maxReps);

  if (allHitMax) {
    if (isAssisted) {
      // In assisted exercises, increasing load means decreasing counterweight assistance
      const nextAssistance = Math.max(0, currentLoadKg - loadIncrementKg);
      return {
        action: "INCREASE_LOAD",
        nextLoadKg: Math.round(nextAssistance * 10) / 10,
        targetRepBracket,
        reasoning: `Teto de ${maxReps} reps atingido em todas as séries. Reduza a assistência da máquina em -${loadIncrementKg} kg para intensificar a sobrecarga progressiva.`,
        isAssisted: true,
      };
    }

    const nextLoad = currentLoadKg + loadIncrementKg;
    return {
      action: "INCREASE_LOAD",
      nextLoadKg: Math.round(nextLoad * 10) / 10,
      targetRepBracket,
      reasoning: `Teto de ${maxReps} reps atingido em todas as séries. Adicione +${loadIncrementKg} kg e retorne ao piso de ${minReps} reps na próxima sessão.`,
      isAssisted: false,
    };
  }

  const anyBelowMin = completedReps.some((r) => r < minReps);
  if (anyBelowMin) {
    if (isAssisted) {
      const resetAssistance = currentLoadKg + loadIncrementKg;
      return {
        action: "REDUCE_LOAD_RESET",
        nextLoadKg: Math.round(resetAssistance * 10) / 10,
        targetRepBracket,
        reasoning: `Repetições abaixo do piso de ${minReps} reps. Aumente a assistência em +${loadIncrementKg} kg para consolidar a faixa de trabalho.`,
        isAssisted: true,
      };
    }

    const resetLoad = Math.max(0, currentLoadKg * 0.95);
    return {
      action: "REDUCE_LOAD_RESET",
      nextLoadKg: Math.round(resetLoad * 10) / 10,
      targetRepBracket,
      reasoning: `Repetições abaixo do piso de ${minReps} reps. Reduza a carga em ~5% para manter a técnica e o volume prescrito.`,
      isAssisted: false,
    };
  }

  return {
    action: "MAINTAIN_LOAD_PUSH_REPS",
    nextLoadKg: currentLoadKg,
    targetRepBracket,
    reasoning: `Mantenha a carga de ${currentLoadKg} kg e busque progredir repetições até completar ${maxReps} reps em todas as séries.`,
    isAssisted,
  };
}

/**
 * Calculates Estimated 1RM using Epley's formula.
 */
export function calculateEst1Rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/**
 * Maps raw Hevy primary muscle group strings into the 9 core tracked categories.
 */
export function mapToMuscleGroupKey(
  rawMuscleGroup?: string | null
): MuscleGroupKey | null {
  if (!rawMuscleGroup) return null;
  const n = rawMuscleGroup.toLowerCase().trim();

  if (n.includes("chest") || n.includes("pec")) {
    return "chest";
  }
  if (
    n.includes("back") ||
    n.includes("lat") ||
    n.includes("trap") ||
    n.includes("rhomboid")
  ) {
    return "back";
  }
  if (n.includes("quad") || n.includes("thigh") || n === "legs") {
    return "quads";
  }
  if (n.includes("calf") || n.includes("calves")) {
    return "calves";
  }
  if (n.includes("glute") || n.includes("hamstring")) {
    return "hamstrings_glutes";
  }
  if (n.includes("shoulder") || n.includes("deltoid")) {
    return "shoulders";
  }
  if (n.includes("bicep") || n.includes("forearm")) {
    return "biceps";
  }
  if (n.includes("tricep")) {
    return "triceps";
  }
  if (
    n.includes("abs") ||
    n.includes("abdom") ||
    n.includes("core") ||
    n.includes("lower_back") ||
    n.includes("lower back") ||
    n.includes("spine")
  ) {
    return "core";
  }

  return null;
}

/**
 * Resolves a muscle group from either a raw muscle group string or an exercise title.
 */
export function inferMuscleGroup(
  rawMuscleGroup?: string | null,
  title?: string | null
): MuscleGroupKey | null {
  const fromGroup = mapToMuscleGroupKey(rawMuscleGroup);
  if (fromGroup) return fromGroup;

  if (!title) return null;
  const t = title.toLowerCase();

  // Calves
  if (
    t.includes("calf") ||
    t.includes("calves") ||
    t.includes("panturrilha") ||
    t.includes("gêmeos") ||
    t.includes("soleo") ||
    t.includes("sóleo")
  ) {
    return "calves";
  }

  // Core & Abdominals
  if (
    t.includes("abdom") ||
    t.includes("abs") ||
    t.includes("core") ||
    t.includes("prancha") ||
    t.includes("plank") ||
    t.includes("crunch") ||
    t.includes("hiperextensão") ||
    t.includes("hyperextension") ||
    t.includes("lombar") ||
    t.includes("lower back")
  ) {
    return "core";
  }

  // Hamstrings & Glutes (checked before general leg or biceps)
  if (
    t.includes("hamstring") ||
    t.includes("posterior") ||
    t.includes("glute") ||
    t.includes("glúteo") ||
    t.includes("stiff") ||
    t.includes("rdl") ||
    t.includes("romanian") ||
    t.includes("flexora") ||
    t.includes("curl leg") ||
    t.includes("leg curl") ||
    t.includes("hip thrust") ||
    t.includes("elevação pélvica") ||
    t.includes("pelvic")
  ) {
    return "hamstrings_glutes";
  }

  // Triceps (checked before general arms or chest)
  if (
    t.includes("tricep") ||
    t.includes("tríceps") ||
    t.includes("skull crusher") ||
    t.includes("testa") ||
    t.includes("francês") ||
    t.includes("french") ||
    t.includes("pushdown") ||
    t.includes("corda") ||
    t.includes("coice") ||
    t.includes("kickback") ||
    t.includes("pulley tríceps") ||
    t.includes("supino fechado") ||
    t.includes("close grip bench")
  ) {
    return "triceps";
  }

  // Biceps (checked before general arms)
  if (
    t.includes("bicep") ||
    t.includes("bíceps") ||
    t.includes("rosca") ||
    t.includes("curl") ||
    t.includes("martelo") ||
    t.includes("scott") ||
    t.includes("spider") ||
    t.includes("antebraço") ||
    t.includes("forearm") ||
    t.includes("punho")
  ) {
    return "biceps";
  }

  // Chest
  if (
    t.includes("chest") ||
    t.includes("peito") ||
    t.includes("bench") ||
    t.includes("supino") ||
    t.includes("pec") ||
    t.includes("crossover") ||
    t.includes("cross over") ||
    t.includes("flexão") ||
    t.includes("push up") ||
    t.includes("pushup") ||
    t.includes("fly") ||
    t.includes("crucifixo") ||
    t.includes("mergulho") ||
    t.includes("dip") ||
    t.includes("paralela")
  ) {
    return "chest";
  }

  // Back
  if (
    t.includes("back") ||
    t.includes("costas") ||
    t.includes("lat") ||
    t.includes("puxada") ||
    t.includes("pulldown") ||
    t.includes("pull down") ||
    t.includes("remada") ||
    t.includes("row") ||
    t.includes("deadlift") ||
    t.includes("levantamento terra") ||
    t.includes("terra") ||
    t.includes("pull up") ||
    t.includes("pullup") ||
    t.includes("chin up") ||
    t.includes("chinup") ||
    t.includes("trapezius") ||
    t.includes("trapézio") ||
    t.includes("dorsal") ||
    t.includes("pullover")
  ) {
    return "back";
  }

  // Quadriceps
  if (
    t.includes("quad") ||
    t.includes("squat") ||
    t.includes("agachamento") ||
    t.includes("leg press") ||
    t.includes("legpress") ||
    t.includes("extensora") ||
    t.includes("extension") ||
    t.includes("lunge") ||
    t.includes("afundo") ||
    t.includes("passada") ||
    t.includes("hack") ||
    t.includes("sissy") ||
    t.includes("búlgaro") ||
    t.includes("bulgarian")
  ) {
    return "quads";
  }

  // Shoulders
  if (
    t.includes("shoulder") ||
    t.includes("ombro") ||
    t.includes("deltoid") ||
    t.includes("delt") ||
    t.includes("overhead") ||
    t.includes("desenvolvimento") ||
    t.includes("lateral raise") ||
    t.includes("elevação lateral") ||
    t.includes("front raise") ||
    t.includes("elevação frontal") ||
    t.includes("face pull") ||
    t.includes("arnold") ||
    t.includes("militar") ||
    t.includes("military") ||
    t.includes("rear delt")
  ) {
    return "shoulders";
  }

  return null;
}

export interface WorkoutHistoryItemForRecovery {
  endTime: Date;
  exercises: Array<{
    title?: string | null;
    notes?: string | null;
    equipment?: string | null;
    primaryMuscleGroup?: string | null;
    sets: Array<{
      type?: string | null;
      rpe?: number | null;
      reps?: number | null;
      weightKg?: number | null;
    }>;
  }>;
}

/**
 * Computes readiness summary for all 6 muscle groups.
 */
export function computeReadinessSummary(
  workoutsHistory: WorkoutHistoryItemForRecovery[],
  biologicalFactors?: UserProfileBiologicalFactors,
  now = new Date()
): ReadinessSummary {
  const groups: MuscleGroupKey[] = [
    "chest",
    "back",
    "shoulders",
    "biceps",
    "triceps",
    "quads",
    "hamstrings_glutes",
    "calves",
    "core",
  ];

  const sortedWorkouts = [...workoutsHistory].sort(
    (a, b) => b.endTime.getTime() - a.endTime.getTime()
  );

  const lastWorkout = sortedWorkouts[0] || null;
  const hoursSinceLastWorkout = lastWorkout
    ? Math.max(
        0,
        Math.round(
          ((now.getTime() - lastWorkout.endTime.getTime()) / (1000 * 60 * 60)) * 10
        ) / 10
      )
    : null;

  const muscles: Record<MuscleGroupKey, MuscleRecoveryState> =
    {} as Record<MuscleGroupKey, MuscleRecoveryState>;

  for (const group of groups) {
    const category = getMuscleGroupCategory(group);

    let latestAnyTrainedAt: Date | null = null;
    let latestAnySetsCount = 0;
    let latestAnyAvgRpe: number | null = null;
    let latestAnyVolumeKg = 0;
    let latestAnyHoursElapsed: number | null = null;
    let latestAnyRecommendedHours = 0;

    let peakCandidate: {
      trainedAt: Date;
      setsCount: number;
      avgRpe: number | null;
      sessionVolumeKg: number;
      hoursElapsed: number;
      recommendedHours: number;
      remainingRecoveryHours: number;
      readinessPercentage: number;
      status: "ready" | "recovering" | "exhausted";
      clinicalStatus: ReadinessStatus;
      recommendedVolumeMultiplier: 1.0 | 0.8 | 0.0;
    } | null = null;

    for (const w of sortedWorkouts) {
      const msDiff = now.getTime() - w.endTime.getTime();
      const hoursSince = Math.max(0, msDiff / (1000 * 60 * 60));
      // Only inspect sessions within 96h active MPS window once a candidate has been recorded
      if (hoursSince > 96 && latestAnyTrainedAt !== null) {
        break;
      }

      let groupSetsInWorkout = 0;
      let groupRpeInWorkout = 0;
      let groupRpeCountInWorkout = 0;
      let groupVolumeInWorkout = 0;

      for (const ex of w.exercises) {
        const mapped = inferMuscleGroup(ex.primaryMuscleGroup, ex.title);
        if (mapped === group) {
          const movCategory = inferMovementCategory(
            ex.title,
            ex.equipment,
            ex.primaryMuscleGroup
          );
          const isAssisted = isAssistedBodyweightExercise(ex.title, ex.equipment);
          const rpeResolution = sanitizeAndResolveEffectiveRpe(
            ex.sets,
            movCategory,
            ex.notes,
            isAssisted
          );

          for (const set of ex.sets) {
            if (set.type === "warmup") continue;
            groupSetsInWorkout++;
            if (set.weightKg && set.reps) {
              groupVolumeInWorkout += set.weightKg * set.reps;
            }
          }

          if (groupSetsInWorkout > 0) {
            groupRpeInWorkout += rpeResolution.effectiveRpe * groupSetsInWorkout;
            groupRpeCountInWorkout += groupSetsInWorkout;
          }
        }
      }

      if (groupSetsInWorkout > 0) {
        const workoutAvgRpe =
          groupRpeCountInWorkout > 0
            ? Math.round((groupRpeInWorkout / groupRpeCountInWorkout) * 10) / 10
            : null;

        const recHours = calculateUnifiedRecoveryHours(
          groupSetsInWorkout,
          { mode: "rpe", avgRpe: workoutAvgRpe ?? 8.0 },
          biologicalFactors,
          category
        );

        const hoursElapsed = Math.max(
          0,
          Math.round(((now.getTime() - w.endTime.getTime()) / (1000 * 60 * 60)) * 10) / 10
        );

        const evaluation = evaluateMuscleReadiness(
          hoursElapsed,
          recHours,
          biologicalFactors?.reportedSoreness ?? 0
        );

        const remainingHours = Math.max(0, recHours - hoursElapsed);

        let evalStatus: "ready" | "recovering" | "exhausted" = "ready";
        if (evaluation.status === "READY") {
          evalStatus = "ready";
        } else if (evaluation.status === "RECOVERING_TRAINABLE") {
          evalStatus = "recovering";
        } else {
          evalStatus = "exhausted";
        }

        if (latestAnyTrainedAt === null) {
          latestAnyTrainedAt = w.endTime;
          latestAnySetsCount = groupSetsInWorkout;
          latestAnyAvgRpe = workoutAvgRpe;
          latestAnyVolumeKg = Math.round(groupVolumeInWorkout * 10) / 10;
          latestAnyHoursElapsed = hoursElapsed;
          latestAnyRecommendedHours = recHours;
        }

        // Track session with highest remaining residual recovery time
        if (
          peakCandidate === null ||
          remainingHours > peakCandidate.remainingRecoveryHours
        ) {
          peakCandidate = {
            trainedAt: w.endTime,
            setsCount: groupSetsInWorkout,
            avgRpe: workoutAvgRpe,
            sessionVolumeKg: Math.round(groupVolumeInWorkout * 10) / 10,
            hoursElapsed,
            recommendedHours: recHours,
            remainingRecoveryHours: remainingHours,
            readinessPercentage: evaluation.completionPercentage,
            status: evalStatus,
            clinicalStatus: evaluation.status,
            recommendedVolumeMultiplier: evaluation.recommendedVolumeMultiplier,
          };
        }
      }
    }

    let latestTrainedAt: Date | null = null;
    let setsCount = 0;
    let avgRpe: number | null = null;
    let sessionVolumeKg = 0;
    let hoursElapsed: number | null = null;
    let recommendedHours = 0;
    let readinessPercentage = 100;
    let status: "ready" | "recovering" | "exhausted" = "ready";
    let clinicalStatus: ReadinessStatus = "READY";
    let recommendedVolumeMultiplier: 1.0 | 0.8 | 0.0 = 1.0;

    if (peakCandidate && peakCandidate.remainingRecoveryHours > 0) {
      latestTrainedAt = peakCandidate.trainedAt;
      setsCount = peakCandidate.setsCount;
      avgRpe = peakCandidate.avgRpe;
      sessionVolumeKg = peakCandidate.sessionVolumeKg;
      hoursElapsed = peakCandidate.hoursElapsed;
      recommendedHours = peakCandidate.recommendedHours;
      readinessPercentage = peakCandidate.readinessPercentage;
      status = peakCandidate.status;
      clinicalStatus = peakCandidate.clinicalStatus;
      recommendedVolumeMultiplier = peakCandidate.recommendedVolumeMultiplier;
    } else if (latestAnyTrainedAt) {
      latestTrainedAt = latestAnyTrainedAt;
      setsCount = latestAnySetsCount;
      avgRpe = latestAnyAvgRpe;
      sessionVolumeKg = latestAnyVolumeKg;
      hoursElapsed = latestAnyHoursElapsed;
      recommendedHours = latestAnyRecommendedHours;
      readinessPercentage = 100;
      status = "ready";
      clinicalStatus = "READY";
      recommendedVolumeMultiplier = 1.0;
    }

    muscles[group] = {
      group,
      muscleCategory: category,
      lastTrainedAt: latestTrainedAt,
      hoursElapsed,
      recommendedRecoveryHours: recommendedHours,
      readinessPercentage,
      status,
      clinicalStatus,
      recommendedVolumeMultiplier,
      lastSessionSets: setsCount,
      lastSessionVolumeKg: sessionVolumeKg,
      lastSessionAvgRpe: avgRpe,
    };
  }

  const readyGroups = groups.filter((g) => muscles[g].status === "ready");
  const recoveringGroups = groups.filter((g) => muscles[g].status !== "ready");

  let recommendationKey = "all_ready";
  if (recoveringGroups.length > 0 && readyGroups.length > 0) {
    recommendationKey = "partial_ready";
  } else if (readyGroups.length === 0) {
    recommendationKey = "full_recovery_needed";
  }

  return {
    lastWorkoutAt: lastWorkout?.endTime || null,
    hoursSinceLastWorkout,
    muscles,
    readyGroups,
    recoveringGroups,
    recommendationKey,
  };
}

/**
 * Historical Progression Tracking Engine.
 * Traverses chronological workouts (oldest to newest) to detect PRs (Gold Medals)
 * on a set, exercise, and workout level, plus period-level aggregation.
 */
export function computeHistoricalProgressions(
  workoutsChronological: Array<{
    id: string;
    startTime: Date | string;
    exercises: Array<{
      id?: number;
      exerciseTemplateId?: string | null;
      title: string;
      equipment?: string | null;
      notes?: string | null;
      sets: Array<{
        id?: number;
        index?: number;
        type?: string | null;
        weightKg?: number | null;
        reps?: number | null;
      }>;
    }>;
  }>
): {
  workoutMap: Map<string, WorkoutProgressionSummary>;
  getPeriodProgressions: (
    periodDays?: number | null
  ) => PeriodExerciseProgressionItem[];
} {
  // Sort oldest to newest
  const sorted = [...workoutsChronological].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  interface ExerciseRecordState {
    canonicalKey: string;
    title: string;
    isAssisted: boolean;
    primaryMuscleGroup: string | null;
    appearanceCount: number;
    maxWeightKg: number;
    minAssistanceKg: number;
    maxRepsAtBestWeight: number;
    maxEst1RmKg: number;
    firstWeightKg: number;
    firstAssistanceKg: number;
    firstDate: string;
    lastProgressedAt: string;
    prsInHistory: number;
    prEvents: Array<{
      date: string;
      deltaWeightKg: number;
      weightKg: number;
    }>;
  }

  const records = new Map<string, ExerciseRecordState>();
  const workoutMap = new Map<string, WorkoutProgressionSummary>();

  for (const w of sorted) {
    const workoutDateIso = new Date(w.startTime).toISOString();
    let workoutPrCount = 0;
    const exerciseSummaries: ExerciseProgressionSummary[] = [];

    for (const ex of w.exercises) {
      const canonicalKey = (
        ex.exerciseTemplateId ||
        ex.title.toLowerCase().trim()
      );
      const isAssisted = isAssistedBodyweightExercise(ex.title, ex.equipment);
      const workingSets = ex.sets.filter((s) => s.type !== "warmup");

      let state = records.get(canonicalKey);
      if (!state) {
        state = {
          canonicalKey,
          title: ex.title,
          isAssisted,
          primaryMuscleGroup: inferMuscleGroup(null, ex.title),
          appearanceCount: 0,
          maxWeightKg: 0,
          minAssistanceKg: 9999,
          maxRepsAtBestWeight: 0,
          maxEst1RmKg: 0,
          firstWeightKg: 0,
          firstAssistanceKg: 9999,
          firstDate: workoutDateIso,
          lastProgressedAt: workoutDateIso,
          prsInHistory: 0,
          prEvents: [],
        };
        records.set(canonicalKey, state);
      }

      state.appearanceCount++;
      const isBaseline = state.appearanceCount === 1;

      let exercisePrCount = 0;
      let bestProgressionForEx: SetProgressionInfo | null = null;
      const setsProgression: SetProgressionInfo[] = [];

      // Collect completed reps for prescription
      const completedReps = workingSets
        .map((s) => s.reps ?? 0)
        .filter((r) => r > 0);
      const heaviestWeight = workingSets.reduce(
        (max, s) => Math.max(max, s.weightKg ?? 0),
        0
      );

      for (const set of ex.sets) {
        if (set.type === "warmup" || !set.reps || set.reps <= 0) {
          setsProgression.push({
            isProgression: false,
            progressionType: null,
            deltaWeightKg: null,
            deltaReps: null,
            previousWeightKg: null,
            previousReps: null,
            isAssisted,
          });
          continue;
        }

        const currentWeight = set.weightKg ?? 0;
        const currentReps = set.reps;
        const est1Rm = calculateEst1Rm(currentWeight, currentReps);

        if (isBaseline) {
          // Establish baseline without triggering false PRs
          if (isAssisted) {
            if (currentWeight < state.minAssistanceKg) {
              state.minAssistanceKg = currentWeight;
              state.firstAssistanceKg = currentWeight;
            }
          } else {
            if (currentWeight > state.maxWeightKg) {
              state.maxWeightKg = currentWeight;
              state.firstWeightKg = currentWeight;
            }
          }
          if (currentReps > state.maxRepsAtBestWeight) {
            state.maxRepsAtBestWeight = currentReps;
          }
          if (est1Rm > state.maxEst1RmKg) {
            state.maxEst1RmKg = est1Rm;
          }

          setsProgression.push({
            isProgression: false,
            progressionType: null,
            deltaWeightKg: null,
            deltaReps: null,
            previousWeightKg: null,
            previousReps: null,
            isAssisted,
          });
          continue;
        }

        // Post-baseline evaluations
        let isProg = false;
        let pType: "weight_pr" | "reps_pr" | "1rm_pr" | null = null;
        let deltaWeight: number | null = null;
        let deltaReps: number | null = null;
        const prevWeight = isAssisted ? state.minAssistanceKg : state.maxWeightKg;
        const prevReps = state.maxRepsAtBestWeight;

        if (isAssisted) {
          // Assisted Bodyweight: lowering assistance is progression
          if (currentWeight < state.minAssistanceKg && currentWeight >= 0) {
            isProg = true;
            pType = "weight_pr";
            deltaWeight = currentWeight - state.minAssistanceKg; // Negative delta
            state.minAssistanceKg = currentWeight;
            state.maxRepsAtBestWeight = currentReps;
            state.maxEst1RmKg = Math.max(state.maxEst1RmKg, est1Rm);
          } else if (
            currentWeight === state.minAssistanceKg &&
            currentReps > state.maxRepsAtBestWeight
          ) {
            isProg = true;
            pType = "reps_pr";
            deltaReps = currentReps - state.maxRepsAtBestWeight;
            state.maxRepsAtBestWeight = currentReps;
            state.maxEst1RmKg = Math.max(state.maxEst1RmKg, est1Rm);
          } else if (est1Rm > state.maxEst1RmKg) {
            isProg = true;
            pType = "1rm_pr";
            state.maxEst1RmKg = est1Rm;
          }
        } else {
          // Conventional Exercise: increasing weight is progression
          if (currentWeight > state.maxWeightKg) {
            isProg = true;
            pType = "weight_pr";
            deltaWeight = currentWeight - state.maxWeightKg;
            state.maxWeightKg = currentWeight;
            state.maxRepsAtBestWeight = currentReps;
            state.maxEst1RmKg = Math.max(state.maxEst1RmKg, est1Rm);
          } else if (
            currentWeight === state.maxWeightKg &&
            currentReps > state.maxRepsAtBestWeight
          ) {
            isProg = true;
            pType = "reps_pr";
            deltaReps = currentReps - state.maxRepsAtBestWeight;
            state.maxRepsAtBestWeight = currentReps;
            state.maxEst1RmKg = Math.max(state.maxEst1RmKg, est1Rm);
          } else if (est1Rm > state.maxEst1RmKg) {
            isProg = true;
            pType = "1rm_pr";
            state.maxEst1RmKg = est1Rm;
          }
        }

        if (isProg) {
          exercisePrCount++;
          workoutPrCount++;
          state.prsInHistory++;
          state.lastProgressedAt = workoutDateIso;
          state.prEvents.push({
            date: workoutDateIso,
            deltaWeightKg: deltaWeight ?? 0,
            weightKg: currentWeight,
          });

          const pInfo: SetProgressionInfo = {
            isProgression: true,
            progressionType: pType,
            deltaWeightKg: deltaWeight,
            deltaReps,
            previousWeightKg: prevWeight,
            previousReps: prevReps,
            est1RmKg: pType === "1rm_pr" ? est1Rm : undefined,
            isAssisted,
          };
          setsProgression.push(pInfo);

          if (!bestProgressionForEx || pType === "weight_pr") {
            bestProgressionForEx = pInfo;
          }
        } else {
          setsProgression.push({
            isProgression: false,
            progressionType: null,
            deltaWeightKg: null,
            deltaReps: null,
            previousWeightKg: null,
            previousReps: null,
            isAssisted,
          });
        }
      }

      const movCategory = inferMovementCategory(
        ex.title,
        ex.equipment,
        state.primaryMuscleGroup
      );
      const bracket = resolveAdaptiveRepBracket(
        movCategory,
        completedReps,
        ex.notes
      );
      const nextPrescription = prescribeNextLoadStaticDoubleProgression(
        heaviestWeight,
        bracket.minReps,
        bracket.maxReps,
        completedReps,
        2.5,
        isAssisted
      );

      exerciseSummaries.push({
        exerciseTitle: ex.title,
        exerciseTemplateId: ex.exerciseTemplateId ?? null,
        hasProgression: exercisePrCount > 0,
        progressionCount: exercisePrCount,
        bestProgression: bestProgressionForEx,
        isAssisted,
        setsProgression,
        nextPrescription,
      });
    }

    workoutMap.set(w.id, {
      workoutId: w.id,
      hasProgression: workoutPrCount > 0,
      totalPrCount: workoutPrCount,
      exercises: exerciseSummaries,
    });
  }

  const getPeriodProgressions = (
    periodDays?: number | null
  ): PeriodExerciseProgressionItem[] => {
    const now = new Date();
    const cutoffMs = periodDays ? now.getTime() - periodDays * 86400 * 1000 : 0;

    const items: PeriodExerciseProgressionItem[] = [];

    for (const state of records.values()) {
      if (state.appearanceCount < 2) continue;

      const eventsInPeriod = state.prEvents.filter(
        (e) => new Date(e.date).getTime() >= cutoffMs
      );

      if (eventsInPeriod.length === 0) continue;

      if (state.isAssisted) {
        const startAssistance = state.firstAssistanceKg;
        const currentAssistance = state.minAssistanceKg;
        const delta = currentAssistance - startAssistance; // Negative is good
        const pct =
          startAssistance > 0
            ? Math.round(((startAssistance - currentAssistance) / startAssistance) * 1000) / 10
            : 0;

        items.push({
          canonicalKey: state.canonicalKey,
          title: state.title,
          primaryMuscleGroup: state.primaryMuscleGroup,
          isAssisted: true,
          startWeightKg: startAssistance,
          currentWeightKg: currentAssistance,
          deltaWeightKg: delta,
          pctChange: pct,
          bestWeightKg: currentAssistance,
          bestRepsAtWeight: state.maxRepsAtBestWeight,
          bestEst1RmKg: state.maxEst1RmKg,
          prCountInPeriod: eventsInPeriod.length,
          lastProgressedAt: state.lastProgressedAt,
        });
      } else {
        const startW = state.firstWeightKg;
        const currentW = state.maxWeightKg;
        const delta = currentW - startW;
        const pct =
          startW > 0
            ? Math.round((delta / startW) * 1000) / 10
            : 0;

        items.push({
          canonicalKey: state.canonicalKey,
          title: state.title,
          primaryMuscleGroup: state.primaryMuscleGroup,
          isAssisted: false,
          startWeightKg: startW,
          currentWeightKg: currentW,
          deltaWeightKg: delta,
          pctChange: pct,
          bestWeightKg: currentW,
          bestRepsAtWeight: state.maxRepsAtBestWeight,
          bestEst1RmKg: state.maxEst1RmKg,
          prCountInPeriod: eventsInPeriod.length,
          lastProgressedAt: state.lastProgressedAt,
        });
      }
    }

    // Sort by largest prCount or delta
    return items.sort((a, b) => b.prCountInPeriod - a.prCountInPeriod);
  };

  return { workoutMap, getPeriodProgressions };
}
