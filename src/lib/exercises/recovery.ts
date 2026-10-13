/**
 * Scientific muscle recovery readiness and training window engine.
 * Implements:
 * - Localized myofibrillar protein synthesis (MPS) & tissue repair kinetics (Schoenfeld 2016, 2021; Damas 2016)
 * - Biological personalization: Sex differences in fatigability/recovery (Hunter 2014, 2020)
 * - Biological personalization: Age-related collagen turnover & anabolic resistance (Fell & Williams 2008; Fernandes et al. 2025)
 * - Muscle-group specific categorization (chest, back, quads, hamstrings/glutes, shoulders, arms)
 */

export type MuscleGroupKey =
  | "chest"
  | "back"
  | "quads"
  | "hamstrings_glutes"
  | "shoulders"
  | "arms";

export interface UserProfileBiologicalFactors {
  gender?: "male" | "female" | string | null;
  birthday?: string | null; // YYYY-MM-DD
}

export interface MuscleRecoveryState {
  group: MuscleGroupKey;
  lastTrainedAt: Date | null;
  hoursElapsed: number | null;
  recommendedRecoveryHours: number;
  readinessPercentage: number; // 0 to 100
  status: "ready" | "recovering" | "exhausted";
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
 * Maps raw Hevy primary muscle group strings into the 6 core tracked categories.
 */
export function mapToMuscleGroupKey(rawMuscleGroup?: string | null): MuscleGroupKey | null {
  if (!rawMuscleGroup) return null;
  const n = rawMuscleGroup.toLowerCase().trim();

  if (n.includes("chest") || n.includes("pec")) {
    return "chest";
  }
  if (
    n.includes("back") ||
    n.includes("lat") ||
    n.includes("trap") ||
    n.includes("rhomboid") ||
    n.includes("spine")
  ) {
    return "back";
  }
  if (n.includes("quad") || n.includes("thigh") || n === "legs") {
    return "quads";
  }
  if (
    n.includes("glute") ||
    n.includes("hamstring") ||
    n.includes("calf") ||
    n.includes("calves")
  ) {
    return "hamstrings_glutes";
  }
  if (n.includes("shoulder") || n.includes("deltoid")) {
    return "shoulders";
  }
  if (
    n.includes("bicep") ||
    n.includes("tricep") ||
    n.includes("arm") ||
    n.includes("forearm")
  ) {
    return "arms";
  }

  return null;
}

/**
 * Resolves a muscle group from either a raw muscle group string or an exercise title.
 * Provides resilient bilingual (English/Portuguese) keyword matching when templates are unlinked.
 */
export function inferMuscleGroup(
  rawMuscleGroup?: string | null,
  title?: string | null
): MuscleGroupKey | null {
  const fromGroup = mapToMuscleGroupKey(rawMuscleGroup);
  if (fromGroup) return fromGroup;

  if (!title) return null;
  const t = title.toLowerCase();

  // Chest / Peito
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
    t.includes("dips") ||
    t.includes("mergulho")
  ) {
    return "chest";
  }

  // Hamstrings & Glutes / Posteriores & Glúteos / Panturrilha
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
    t.includes("pelvic") ||
    t.includes("calf") ||
    t.includes("calves") ||
    t.includes("panturrilha") ||
    t.includes("gêmeos")
  ) {
    return "hamstrings_glutes";
  }

  // Back / Costas
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

  // Quadriceps / Pernas
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

  // Shoulders / Ombros
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
    t.includes("military")
  ) {
    return "shoulders";
  }

  // Arms / Braços (Biceps / Triceps / Antebraço)
  if (
    t.includes("bicep") ||
    t.includes("bíceps") ||
    t.includes("tricep") ||
    t.includes("tríceps") ||
    t.includes("arm") ||
    t.includes("braço") ||
    t.includes("rosca") ||
    t.includes("curl") ||
    t.includes("skull crusher") ||
    t.includes("testa") ||
    t.includes("francês") ||
    t.includes("pushdown") ||
    t.includes("corda") ||
    t.includes("coice") ||
    t.includes("antebraço") ||
    t.includes("forearm")
  ) {
    return "arms";
  }

  return null;
}

/**
 * Calculates dynamic recovery window in hours (between 24h and 72h) based on:
 * - Effective working sets
 * - Average RPE
 * - Biological sex (Hunter 2014, 2020)
 * - Biological age (Fell & Williams 2008; Fernandes et al. 2025)
 */
export function calculateRecoveryWindowHours(
  sets: number,
  avgRpe: number | null,
  biologicalFactors?: UserProfileBiologicalFactors
): number {
  if (sets <= 0) return 24;

  const rpe = avgRpe ?? 7.5;
  // Base model: 24h base + 3h per effective set scaled by RPE / 8
  const baseHours = 24 + sets * 3.0 * (rpe / 8);

  // 1. Sex Factor: Females show greater fatigue resistance & faster neuromuscular recovery in submaximal lifting
  const kSex = biologicalFactors?.gender === "female" ? 0.9 : 1.0;

  // 2. Age Factor: Smooth scaling above 40 years to respect collagen turnover and anabolic resistance
  let kAge = 1.0;
  if (biologicalFactors?.birthday) {
    const age = calculateAgeInYears(biologicalFactors.birthday);
    if (age !== null) {
      if (age > 40 && age <= 65) {
        kAge = 1.0 + (age - 40) * 0.008; // 50 years: +8%; 60 years: +16%
      } else if (age > 65) {
        kAge = 1.2; // 20% cap for 65+
      }
    }
  }

  const finalHours = baseHours * kSex * kAge;
  return Math.min(72, Math.max(24, Math.round(finalHours)));
}

export interface WorkoutHistoryItemForRecovery {
  endTime: Date;
  exercises: Array<{
    title?: string | null;
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
 * Computes the readiness status for all 6 muscle groups from the user's workout history.
 */
export function computeReadinessSummary(
  workoutsHistory: WorkoutHistoryItemForRecovery[],
  biologicalFactors?: UserProfileBiologicalFactors,
  now = new Date()
): ReadinessSummary {
  const groups: MuscleGroupKey[] = [
    "chest",
    "back",
    "quads",
    "hamstrings_glutes",
    "shoulders",
    "arms",
  ];

  // Sort history newest to oldest
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
    // Find latest session where this muscle group had working sets
    let latestTrainedAt: Date | null = null;
    let setsCount = 0;
    let totalRpe = 0;
    let setsWithRpe = 0;
    let sessionVolumeKg = 0;

    for (const w of sortedWorkouts) {
      let groupSetsInWorkout = 0;
      let groupRpeInWorkout = 0;
      let groupRpeCountInWorkout = 0;
      let groupVolumeInWorkout = 0;

      for (const ex of w.exercises) {
        const mapped = inferMuscleGroup(ex.primaryMuscleGroup, ex.title);
        if (mapped === group) {
          for (const set of ex.sets) {
            if (set.type === "warmup") continue;
            groupSetsInWorkout++;
            if (set.weightKg && set.reps) {
              groupVolumeInWorkout += set.weightKg * set.reps;
            }
            if (set.rpe && set.rpe > 0) {
              groupRpeInWorkout += set.rpe;
              groupRpeCountInWorkout++;
            }
          }
        }
      }

      if (groupSetsInWorkout > 0) {
        latestTrainedAt = w.endTime;
        setsCount = groupSetsInWorkout;
        totalRpe = groupRpeInWorkout;
        setsWithRpe = groupRpeCountInWorkout;
        sessionVolumeKg = Math.round(groupVolumeInWorkout * 10) / 10;
        break; // Only need the most recent session for recovery window
      }
    }

    const avgRpe =
      setsWithRpe > 0 ? Math.round((totalRpe / setsWithRpe) * 10) / 10 : null;
    const recommendedHours = calculateRecoveryWindowHours(
      setsCount,
      avgRpe,
      biologicalFactors
    );

    let hoursElapsed: number | null = null;
    let readinessPercentage = 100;
    let status: "ready" | "recovering" | "exhausted" = "ready";

    if (latestTrainedAt) {
      hoursElapsed = Math.max(
        0,
        Math.round(
          ((now.getTime() - latestTrainedAt.getTime()) / (1000 * 60 * 60)) * 10
        ) / 10
      );
      readinessPercentage = Math.min(
        100,
        Math.max(0, Math.round((hoursElapsed / recommendedHours) * 100))
      );

      if (readinessPercentage >= 100) {
        status = "ready";
      } else if (readinessPercentage >= 50) {
        status = "recovering";
      } else {
        status = "exhausted";
      }
    }

    muscles[group] = {
      group,
      lastTrainedAt: latestTrainedAt,
      hoursElapsed,
      recommendedRecoveryHours: recommendedHours,
      readinessPercentage,
      status,
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
