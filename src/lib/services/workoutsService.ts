import { db } from "@/db/client";
import { recompRecords, users, workouts } from "@/db/schema";
import { asc, desc, eq, and } from "drizzle-orm";
import {
  calculateAgeInYears,
  computeHistoricalProgressions,
  computeReadinessSummary,
  inferMovementCategory,
  isAssistedBodyweightExercise,
  MuscleGroupKey,
  prescribeNextLoadStaticDoubleProgression,
  resolveAdaptiveRepBracket,
  sanitizeAndResolveEffectiveRpe,
  WorkoutHistoryItemForRecovery,
} from "@/lib/exercises/recovery";
import type {
  MuscleReadinessItem,
  MuscleReadinessResponse,
  WorkoutCalendarItem,
  WorkoutChartPoint,
  WorkoutStatsResponse,
} from "@/lib/api";
import { parseDateRangeBound, ServiceError } from "./errors";

export type WorkoutsPeriod = "all" | "1m" | "3m" | "6m" | "1y";

const MUSCLE_NAMES: Record<MuscleGroupKey, { en: string; pt: string; es: string }> = {
  chest: { en: "Chest", pt: "Peito", es: "Pecho" },
  back: { en: "Back", pt: "Costas", es: "Espalda" },
  shoulders: { en: "Shoulders", pt: "Ombros", es: "Hombros" },
  biceps: { en: "Biceps", pt: "Bíceps", es: "Bíceps" },
  triceps: { en: "Triceps", pt: "Tríceps", es: "Tríceps" },
  quads: { en: "Quadriceps", pt: "Quadríceps", es: "Cuádriceps" },
  hamstrings_glutes: {
    en: "Hamstrings & Glutes",
    pt: "Posteriores e Glúteos",
    es: "Isquiotibiales y Glúteos",
  },
  calves: { en: "Calves", pt: "Panturrilhas", es: "Pantorrillas" },
  core: { en: "Abs & Core", pt: "Abdômen & Core", es: "Abdomen y Core" },
};

function formatMuscleName(group: MuscleGroupKey, lang: string): string {
  const l = (lang === "pt" || lang === "es" ? lang : "en") as "en" | "pt" | "es";
  return MUSCLE_NAMES[group]?.[l] || group;
}

function buildRecommendationMessage(
  recommendationKey: string,
  readyGroups: MuscleGroupKey[],
  recoveringGroups: MuscleGroupKey[],
  muscles: Record<MuscleGroupKey, { remainingRecoveryHours: number }>,
  lang: string
): string {
  const isPt = lang.startsWith("pt");
  const isEs = lang.startsWith("es");

  if (recommendationKey === "all_ready" || recoveringGroups.length === 0) {
    if (isPt) {
      return "Todos os principais grupos musculares estão recuperados (100%). Janela metabólica ideal para treino de alta intensidade ou progressão de carga.";
    }
    if (isEs) {
      return "Todos los principales grupos musculares están recuperados (100%). Ventana metabólica ideal para entrenamiento de alta intensidad o sobrecarga progresiva.";
    }
    return "All major muscle groups are fully recovered (100%). Optimal metabolic window for high-intensity training or progressive overload.";
  }

  if (recommendationKey === "full_recovery_needed" || readyGroups.length === 0) {
    const maxRemaining = Math.max(
      ...recoveringGroups.map((g) => muscles[g]?.remainingRecoveryHours || 0)
    );
    if (isPt) {
      return `Todos os grupos musculares estimulados recentemente estão em fase de reparo tecidual ativo (~${Math.round(maxRemaining)}h restantes). Recomenda-se repouso ou recuperação ativa leve.`;
    }
    if (isEs) {
      return `Todos los grupos musculares entrenados recientemente están en fase de reparación tisular activa (~${Math.round(maxRemaining)}h restantes). Se recomienda descanso o recuperación activa ligera.`;
    }
    return `All recently trained muscle groups are undergoing active tissue repair (~${Math.round(maxRemaining)}h remaining). Prioritize rest or light active recovery.`;
  }

  const readyNames = readyGroups.map((g) =>
    formatMuscleName(g, isPt ? "pt" : isEs ? "es" : "en")
  );
  const recNamesWithHours = recoveringGroups.map((g) => {
    const hours = Math.round(muscles[g]?.remainingRecoveryHours || 0);
    const name = formatMuscleName(g, isPt ? "pt" : isEs ? "es" : "en");
    return `${name} (~${hours}h)`;
  });

  const joinList = (arr: string[], conj: string) => {
    if (arr.length === 0) return "";
    if (arr.length === 1) return arr[0];
    return `${arr.slice(0, -1).join(", ")} ${conj} ${arr[arr.length - 1]}`;
  };

  if (isPt) {
    return `${joinList(readyNames, "e")} estão prontos para estímulo. ${joinList(recNamesWithHours, "e")} ainda em janela de recuperação tecidual.`;
  }
  if (isEs) {
    return `${joinList(readyNames, "y")} están listos para entrenar. ${joinList(recNamesWithHours, "y")} aún en ventana de recuperación tisular.`;
  }
  return `${joinList(readyNames, "and")} are ready for training. ${joinList(recNamesWithHours, "and")} still in recovery window.`;
}

function formatWeekLabel(date: Date, lang: string): string {
  const isPt = lang.startsWith("pt");
  const isEs = lang.startsWith("es");

  const day = date.getDate();
  const monthsPt = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const monthsEs = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const mIndex = date.getMonth();
  if (isPt) return `${day} de ${monthsPt[mIndex]}.`;
  if (isEs) return `${day} de ${monthsEs[mIndex]}.`;
  return `${monthsEn[mIndex]} ${day}`;
}

function formatMonthLabel(date: Date, lang: string): string {
  const isPt = lang.startsWith("pt");
  const isEs = lang.startsWith("es");

  const monthsPt = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const monthsEs = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const mIndex = date.getMonth();
  const yearShort = String(date.getFullYear()).slice(-2);
  const mName = isPt ? monthsPt[mIndex] : isEs ? monthsEs[mIndex] : monthsEn[mIndex];
  return `${mName}/${yearShort}`;
}

function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface ListWorkoutsOptions {
  page?: number;
  pageSize?: number | "all";
  offset?: number;
  from?: string;
  to?: string;
}

/**
 * Lists paginated workouts with historical PR progression counts and effective RPE derivation.
 */
export async function listWorkouts(
  userId: number,
  options: ListWorkoutsOptions = {}
) {
  const fromDate = options.from ? parseDateRangeBound(options.from, "start") : null;
  const toDate = options.to ? parseDateRangeBound(options.to, "end") : null;

  const page = Math.max(1, Math.floor(options.page ?? 1));
  const isAll = options.pageSize === "all" || options.pageSize === -1;
  const rawPageSize = typeof options.pageSize === "number" ? options.pageSize : 20;
  const limit = isAll ? 10000 : Math.min(1000, Math.max(1, Math.floor(rawPageSize)));
  const offset = isAll
    ? 0
    : options.offset !== undefined
    ? Math.max(0, Math.floor(options.offset))
    : (page - 1) * limit;

  // Fetch all user workouts chronologically to compute historical progression badges (PRs)
  const allUserWorkouts = await db.query.workouts.findMany({
    where: eq(workouts.userId, userId),
    orderBy: [asc(workouts.startTime)],
    with: {
      exercises: {
        with: {
          sets: true,
          template: true,
        },
      },
    },
  });

  const { workoutMap } = computeHistoricalProgressions(
    allUserWorkouts.map((w) => ({
      id: w.id,
      startTime: w.startTime,
      exercises: w.exercises.map((ex) => ({
        id: ex.id,
        exerciseTemplateId: ex.exerciseTemplateId,
        title: ex.title,
        equipment: ex.template?.equipment ?? null,
        notes: ex.notes,
        sets: ex.sets.map((s) => ({
          id: s.id,
          index: s.index,
          type: s.type,
          weightKg: s.weightKg,
          reps: s.reps,
        })),
      })),
    }))
  );

  const filtered = allUserWorkouts.filter((w) => {
    if (fromDate && w.startTime < fromDate) return false;
    if (toDate && w.startTime > toDate) return false;
    return true;
  });

  const total = filtered.length;
  const reversed = [...filtered].reverse();
  const list = isAll ? reversed : reversed.slice(offset, offset + limit);

  const sanitized = list.map((w) => {
    const prog = workoutMap.get(w.id);

    // Derive effective RPE if missing in DB
    let effectiveAvgRpe = w.avgRpe;
    if (effectiveAvgRpe === null && w.exercises.length > 0) {
      let totalRpeSum = 0;
      let workingSetsCount = 0;
      for (const ex of w.exercises) {
        const movCat = inferMovementCategory(
          ex.title,
          ex.template?.equipment ?? null,
          ex.template?.primaryMuscleGroup ?? null
        );
        const isAssisted = isAssistedBodyweightExercise(
          ex.title,
          ex.template?.equipment ?? null
        );
        const rpeRes = sanitizeAndResolveEffectiveRpe(
          ex.sets,
          movCat,
          ex.notes,
          isAssisted
        );
        const numSets = ex.sets.filter((s) => s.type !== "warmup").length;
        if (numSets > 0) {
          totalRpeSum += rpeRes.effectiveRpe * numSets;
          workingSetsCount += numSets;
        }
      }
      if (workingSetsCount > 0) {
        effectiveAvgRpe = Math.round((totalRpeSum / workingSetsCount) * 10) / 10;
      }
    }

    return {
      id: w.id,
      title: w.title,
      description: w.description,
      startTime: w.startTime.toISOString(),
      endTime: w.endTime.toISOString(),
      durationSeconds: w.durationSeconds,
      totalVolumeKg: w.totalVolumeKg,
      sessionCaloriesBurned: w.sessionCaloriesBurned,
      epocCaloriesBurned: w.epocCaloriesBurned,
      totalCaloriesBurned: w.totalCaloriesBurned,
      avgRpe: effectiveAvgRpe,
      source: w.source,
      hasProgression: prog?.hasProgression ?? false,
      progressionCount: prog?.totalPrCount ?? 0,
      exercisesCount: w.exercises.length,
      exercises: w.exercises.map((ex) => ({
        id: ex.id,
        title: ex.title,
        index: ex.index,
        primaryMuscleGroup: ex.template?.primaryMuscleGroup ?? null,
        equipment: ex.template?.equipment ?? null,
        setsCount: ex.sets.length,
        sets: ex.sets.map((s) => ({
          id: s.id,
          index: s.index,
          type: s.type,
          weightKg: s.weightKg,
          reps: s.reps,
          rpe: s.rpe,
          durationSeconds: s.durationSeconds,
          distanceMeters: s.distanceMeters,
        })),
      })),
      createdAt: w.createdAt.toISOString(),
    };
  });

  return {
    total,
    limit,
    offset,
    page,
    pageSize: limit,
    hasMore: offset + list.length < total,
    workouts: sanitized,
  };
}

/**
 * Fetches full workout breakdown with PR deltas, RPE sanitization, and double-progression prescriptions.
 */
export async function getWorkoutDetails(userId: number, workoutId: string) {
  const id = String(workoutId || "").trim();
  if (!id) {
    throw new ServiceError("Workout ID is required", 400, "WORKOUT_ID_REQUIRED");
  }

  const w = await db.query.workouts.findFirst({
    where: and(eq(workouts.id, id), eq(workouts.userId, userId)),
    with: {
      exercises: {
        with: {
          sets: true,
          template: true,
        },
      },
    },
  });

  if (!w) {
    throw new ServiceError("Workout not found", 404, "WORKOUT_NOT_FOUND");
  }

  const allUserWorkouts = await db.query.workouts.findMany({
    where: eq(workouts.userId, userId),
    orderBy: [asc(workouts.startTime)],
    with: {
      exercises: {
        with: {
          sets: true,
          template: true,
        },
      },
    },
  });

  const { workoutMap } = computeHistoricalProgressions(
    allUserWorkouts.map((item) => ({
      id: item.id,
      startTime: item.startTime,
      exercises: item.exercises.map((ex) => ({
        id: ex.id,
        exerciseTemplateId: ex.exerciseTemplateId,
        title: ex.title,
        equipment: ex.template?.equipment ?? null,
        notes: ex.notes,
        sets: ex.sets.map((s) => ({
          id: s.id,
          index: s.index,
          type: s.type,
          weightKg: s.weightKg,
          reps: s.reps,
        })),
      })),
    }))
  );

  const workoutProgression = workoutMap.get(w.id);

  const exercisesEnriched = w.exercises.map((ex, exIdx) => {
    const exProg = workoutProgression?.exercises[exIdx];
    const movCategory = inferMovementCategory(
      ex.title,
      ex.template?.equipment ?? null,
      ex.template?.primaryMuscleGroup ?? null
    );
    const isAssisted = isAssistedBodyweightExercise(
      ex.title,
      ex.template?.equipment ?? null
    );

    const completedReps = ex.sets
      .filter((s) => s.type !== "warmup")
      .map((s) => s.reps ?? 0)
      .filter((r) => r > 0);

    const targetRepBracket = resolveAdaptiveRepBracket(
      movCategory,
      completedReps,
      ex.notes
    );

    const rpeRes = sanitizeAndResolveEffectiveRpe(
      ex.sets,
      movCategory,
      ex.notes,
      isAssisted
    );

    const heaviestLoad = ex.sets
      .filter((s) => s.type !== "warmup")
      .reduce((max, s) => Math.max(max, s.weightKg ?? 0), 0);

    const prescription = prescribeNextLoadStaticDoubleProgression(
      heaviestLoad,
      targetRepBracket.minReps,
      targetRepBracket.maxReps,
      completedReps,
      2.5,
      isAssisted
    );

    const setsEnriched = ex.sets.map((s, sIdx) => {
      const setProg = exProg?.setsProgression[sIdx];
      return {
        id: s.id,
        index: s.index,
        type: s.type,
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
        durationSeconds: s.durationSeconds,
        distanceMeters: s.distanceMeters,
        customMetric: s.customMetric,
        isProgression: setProg?.isProgression ?? false,
        progressionType: setProg?.progressionType ?? null,
        deltaWeightKg: setProg?.deltaWeightKg ?? null,
        deltaReps: setProg?.deltaReps ?? null,
        previousWeightKg: setProg?.previousWeightKg ?? null,
        previousReps: setProg?.previousReps ?? null,
        est1RmKg: setProg?.est1RmKg ?? null,
        isAssisted,
      };
    });

    return {
      id: ex.id,
      title: ex.title,
      index: ex.index,
      notes: ex.notes,
      supersetId: ex.supersetId,
      primaryMuscleGroup: ex.template?.primaryMuscleGroup ?? null,
      equipment: ex.template?.equipment ?? null,
      thumbnailUrl: ex.template?.thumbnailUrl ?? null,
      movementCategory: movCategory,
      isAssisted,
      targetRepBracket,
      effectiveRpe: rpeRes.effectiveRpe,
      rpeSource: rpeRes.source,
      wasSanitized: rpeRes.wasSanitized,
      hasProgression: exProg?.hasProgression ?? false,
      progressionCount: exProg?.progressionCount ?? 0,
      bestProgressionBadge: exProg?.bestProgression ?? null,
      progressionPrescription: prescription,
      sets: setsEnriched,
    };
  });

  return {
    id: w.id,
    title: w.title,
    description: w.description,
    startTime: w.startTime.toISOString(),
    endTime: w.endTime.toISOString(),
    durationSeconds: w.durationSeconds,
    totalVolumeKg: w.totalVolumeKg,
    sessionCaloriesBurned: w.sessionCaloriesBurned,
    epocCaloriesBurned: w.epocCaloriesBurned,
    totalCaloriesBurned: w.totalCaloriesBurned,
    avgRpe: w.avgRpe,
    source: w.source,
    hasProgression: workoutProgression?.hasProgression ?? false,
    progressionCount: workoutProgression?.totalPrCount ?? 0,
    exercises: exercisesEnriched,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export interface WorkoutStatsWithCalories extends WorkoutStatsResponse {
  calories?: {
    totalCaloriesBurned: number;
    sessionCaloriesBurned: number;
    epocCaloriesBurned: number;
    currentWeekCaloriesBurned: number;
  };
}

/**
 * Computes aggregated workout statistics, chart buckets, calendar metadata, and optional caloric expenditure.
 */
export async function getWorkoutStats(
  userId: number,
  options: { period?: WorkoutsPeriod; lang?: string; includeCalories?: boolean } = {}
): Promise<WorkoutStatsWithCalories> {
  const period: WorkoutsPeriod =
    options.period && ["all", "1m", "3m", "6m", "1y"].includes(options.period)
      ? options.period
      : "3m";
  const lang = (options.lang || "pt").toLowerCase();

  const allWorkouts = await db.query.workouts.findMany({
    where: eq(workouts.userId, userId),
    orderBy: [asc(workouts.startTime)],
    with: {
      exercises: {
        with: {
          sets: true,
        },
      },
    },
  });

  const now = new Date();

  const currentDayOfWeek = now.getDay();
  const distanceToMonday = (currentDayOfWeek + 6) % 7;
  const startOfCurrentWeek = new Date(now);
  startOfCurrentWeek.setDate(now.getDate() - distanceToMonday);
  startOfCurrentWeek.setHours(0, 0, 0, 0);

  const endOfCurrentWeek = new Date(startOfCurrentWeek);
  endOfCurrentWeek.setDate(startOfCurrentWeek.getDate() + 6);
  endOfCurrentWeek.setHours(23, 59, 59, 999);

  let currentWeekDurationSeconds = 0;
  let currentWeekVolumeKg = 0;
  let currentWeekReps = 0;
  let currentWeekWorkoutsCount = 0;
  let currentWeekCaloriesBurned = 0;

  const calendarDays: Record<string, WorkoutCalendarItem[]> = {};

  const processedWorkouts = allWorkouts.map((w) => {
    let reps = 0;
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (s.reps && s.reps > 0) {
          reps += s.reps;
        }
      }
    }

    const dateKey = toLocalDateString(w.startTime);
    const calendarItem: WorkoutCalendarItem = {
      id: w.id,
      title: w.title,
      startTime: w.startTime.toISOString(),
      durationSeconds: w.durationSeconds,
      totalVolumeKg: w.totalVolumeKg,
      repsCount: reps,
    };

    if (!calendarDays[dateKey]) {
      calendarDays[dateKey] = [];
    }
    calendarDays[dateKey].push(calendarItem);

    if (w.startTime >= startOfCurrentWeek && w.startTime <= endOfCurrentWeek) {
      currentWeekDurationSeconds += w.durationSeconds;
      currentWeekVolumeKg += w.totalVolumeKg;
      currentWeekReps += reps;
      currentWeekWorkoutsCount++;
      currentWeekCaloriesBurned += w.totalCaloriesBurned || 0;
    }

    return {
      ...w,
      reps,
    };
  });

  let cutoffDate: Date | null = null;
  if (period === "1m") {
    cutoffDate = new Date(now);
    cutoffDate.setDate(now.getDate() - 30);
  } else if (period === "3m") {
    cutoffDate = new Date(now);
    cutoffDate.setDate(now.getDate() - 90);
  } else if (period === "6m") {
    cutoffDate = new Date(now);
    cutoffDate.setDate(now.getDate() - 180);
  } else if (period === "1y") {
    cutoffDate = new Date(now);
    cutoffDate.setDate(now.getDate() - 365);
  }

  const filteredWorkouts = cutoffDate
    ? processedWorkouts.filter((w) => w.startTime >= cutoffDate)
    : processedWorkouts;

  const totalWorkouts = filteredWorkouts.length;
  let totalDurationSeconds = 0;
  let totalVolumeKg = 0;
  let totalReps = 0;
  let totalCaloriesBurned = 0;
  let sessionCaloriesBurned = 0;
  let epocCaloriesBurned = 0;

  for (const w of filteredWorkouts) {
    totalDurationSeconds += w.durationSeconds;
    totalVolumeKg += w.totalVolumeKg;
    totalReps += w.reps;
    totalCaloriesBurned += w.totalCaloriesBurned || 0;
    sessionCaloriesBurned += w.sessionCaloriesBurned || 0;
    epocCaloriesBurned += w.epocCaloriesBurned || 0;
  }

  const chartData: WorkoutChartPoint[] = [];

  if (period === "1m" || period === "3m" || period === "6m") {
    const weekCount = period === "1m" ? 4 : period === "3m" ? 12 : 26;

    for (let i = weekCount - 1; i >= 0; i--) {
      const weekEnd = new Date(endOfCurrentWeek);
      weekEnd.setDate(endOfCurrentWeek.getDate() - i * 7);
      weekEnd.setHours(23, 59, 59, 999);

      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);

      let bucketDurationSeconds = 0;
      let bucketVolumeKg = 0;
      let bucketReps = 0;
      let bucketWorkouts = 0;

      for (const w of processedWorkouts) {
        if (w.startTime >= weekStart && w.startTime <= weekEnd) {
          bucketDurationSeconds += w.durationSeconds;
          bucketVolumeKg += w.totalVolumeKg;
          bucketReps += w.reps;
          bucketWorkouts++;
        }
      }

      chartData.push({
        label: formatWeekLabel(weekStart, lang),
        startDate: weekStart.toISOString(),
        endDate: weekEnd.toISOString(),
        durationHours: Math.round((bucketDurationSeconds / 3600) * 10) / 10,
        durationSeconds: bucketDurationSeconds,
        volumeKg: Math.round(bucketVolumeKg * 10) / 10,
        reps: bucketReps,
        workoutsCount: bucketWorkouts,
      });
    }
  } else {
    const monthCount = 12;

    for (let i = monthCount - 1; i >= 0; i--) {
      const targetMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1, 0, 0, 0, 0);
      const mEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 23, 59, 59, 999);

      let bucketDurationSeconds = 0;
      let bucketVolumeKg = 0;
      let bucketReps = 0;
      let bucketWorkouts = 0;

      for (const w of processedWorkouts) {
        if (w.startTime >= mStart && w.startTime <= mEnd) {
          bucketDurationSeconds += w.durationSeconds;
          bucketVolumeKg += w.totalVolumeKg;
          bucketReps += w.reps;
          bucketWorkouts++;
        }
      }

      chartData.push({
        label: formatMonthLabel(mStart, lang),
        startDate: mStart.toISOString(),
        endDate: mEnd.toISOString(),
        durationHours: Math.round((bucketDurationSeconds / 3600) * 10) / 10,
        durationSeconds: bucketDurationSeconds,
        volumeKg: Math.round(bucketVolumeKg * 10) / 10,
        reps: bucketReps,
        workoutsCount: bucketWorkouts,
      });
    }
  }

  const response: WorkoutStatsWithCalories = {
    period,
    summary: {
      totalWorkouts,
      totalDurationSeconds,
      totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
      totalReps,
      currentWeekDurationSeconds,
      currentWeekVolumeKg: Math.round(currentWeekVolumeKg * 10) / 10,
      currentWeekReps,
      currentWeekWorkoutsCount,
    },
    chartData,
    calendarDays,
  };

  if (options.includeCalories) {
    response.calories = {
      totalCaloriesBurned: Math.round(totalCaloriesBurned * 10) / 10,
      sessionCaloriesBurned: Math.round(sessionCaloriesBurned * 10) / 10,
      epocCaloriesBurned: Math.round(epocCaloriesBurned * 10) / 10,
      currentWeekCaloriesBurned: Math.round(currentWeekCaloriesBurned * 10) / 10,
    };
  }

  return response;
}

/**
 * Computes exercise-level PRs and load progressions within a target time period.
 */
export async function getWorkoutProgression(
  userId: number,
  options: { period?: WorkoutsPeriod } = {}
) {
  const periodParam = (options.period || "1m").toLowerCase() as WorkoutsPeriod;

  let periodDays: number | null = 30;
  if (periodParam === "all") {
    periodDays = null;
  } else if (periodParam === "1m") {
    periodDays = 30;
  } else if (periodParam === "3m") {
    periodDays = 90;
  } else if (periodParam === "6m") {
    periodDays = 180;
  } else if (periodParam === "1y") {
    periodDays = 365;
  }

  const allUserWorkouts = await db.query.workouts.findMany({
    where: eq(workouts.userId, userId),
    orderBy: [asc(workouts.startTime)],
    with: {
      exercises: {
        with: {
          sets: true,
          template: true,
        },
      },
    },
  });

  const { getPeriodProgressions } = computeHistoricalProgressions(
    allUserWorkouts.map((item) => ({
      id: item.id,
      startTime: item.startTime,
      exercises: item.exercises.map((ex) => ({
        id: ex.id,
        exerciseTemplateId: ex.exerciseTemplateId,
        title: ex.title,
        equipment: ex.template?.equipment ?? null,
        notes: ex.notes,
        sets: ex.sets.map((s) => ({
          id: s.id,
          index: s.index,
          type: s.type,
          weightKg: s.weightKg,
          reps: s.reps,
        })),
      })),
    }))
  );

  const items = getPeriodProgressions(periodDays);
  const totalPrsInPeriod = items.reduce((acc, curr) => acc + curr.prCountInPeriod, 0);

  return {
    period: periodParam,
    items,
    totalPrsInPeriod,
    exercisesProgressedCount: items.length,
  };
}

/**
 * Computes personalized muscle group recovery percentages and localized training recommendations.
 */
export async function getMuscleReadiness(
  userId: number,
  options: { lang?: string; fallbackLang?: string } = {}
): Promise<MuscleReadinessResponse> {
  const userProfile = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const lang = (
    options.lang ||
    userProfile?.preferredLanguage ||
    options.fallbackLang ||
    "pt"
  ).toLowerCase();

  const latestRecord = await db.query.recompRecords.findFirst({
    where: eq(recompRecords.userId, userId),
    orderBy: [desc(recompRecords.date)],
  });

  const effectiveWeightKg =
    latestRecord?.weight ?? userProfile?.targetWeightKg ?? 75;

  const userAge = calculateAgeInYears(userProfile?.birthday ?? null);

  const formatGenderLabel = (g?: string | null) => {
    if (!g) return lang.startsWith("pt") ? "Não informado" : "Unspecified";
    if (g === "male") {
      return lang.startsWith("pt") || lang.startsWith("es") ? "Masculino" : "Male";
    }
    if (g === "female") {
      return lang.startsWith("pt") ? "Feminino" : lang.startsWith("es") ? "Femenino" : "Female";
    }
    return g;
  };

  const recentWorkouts = await db.query.workouts.findMany({
    where: eq(workouts.userId, userId),
    orderBy: [desc(workouts.startTime)],
    limit: 30,
    with: {
      exercises: {
        with: {
          sets: true,
          template: true,
        },
      },
    },
  });

  if (recentWorkouts.length === 0) {
    return {
      muscleGroups: [],
      overallReadiness: "ready",
      smartRecommendation: {
        status: "ready",
        readyGroups: [],
        recoveringGroups: [],
        suggestedFocus: [],
        message: lang.startsWith("pt")
          ? "Nenhum treino de força registrado ainda."
          : lang.startsWith("es")
          ? "Aún no hay entrenamientos de fuerza registrados."
          : "No strength workouts recorded yet.",
      },
      userProfile: {
        gender: formatGenderLabel(userProfile?.gender),
        age: userAge,
        effectiveWeightKg: Math.round(effectiveWeightKg * 10) / 10,
      },
    };
  }

  let caloricState: "deficit" | "surplus" | "maintenance" | null = null;
  if (userProfile?.targetWeightKg && latestRecord?.weight) {
    const diff = latestRecord.weight - userProfile.targetWeightKg;
    if (diff > 0.5) caloricState = "deficit";
    else if (diff < -0.5) caloricState = "surplus";
    else caloricState = "maintenance";
  }

  const mappedHistory: WorkoutHistoryItemForRecovery[] = recentWorkouts.map((w) => ({
    endTime: w.endTime,
    exercises: w.exercises.map((ex) => ({
      title: ex.title,
      notes: ex.notes,
      equipment: ex.template?.equipment ?? null,
      primaryMuscleGroup: ex.template?.primaryMuscleGroup ?? null,
      sets: ex.sets.map((s) => ({
        type: s.type,
        rpe: s.rpe,
        reps: s.reps,
        weightKg: s.weightKg,
      })),
    })),
  }));

  const readiness = computeReadinessSummary(mappedHistory, {
    gender: userProfile?.gender ?? null,
    birthday: userProfile?.birthday ?? null,
    caloricState,
  });

  const muscleGroups: MuscleReadinessItem[] = Object.values(readiness.muscles).map(
    (m) => {
      const remainingHours =
        m.hoursElapsed !== null
          ? Math.max(0, Math.round((m.recommendedRecoveryHours - m.hoursElapsed) * 10) / 10)
          : 0;

      const groupKey = m.group === "quads" ? "quadriceps" : m.group;

      return {
        group: groupKey,
        name: formatMuscleName(m.group, lang),
        status: m.status,
        clinicalStatus: m.clinicalStatus,
        recommendedVolumeMultiplier: m.recommendedVolumeMultiplier,
        muscleCategory: m.muscleCategory,
        readinessScore: m.readinessPercentage,
        lastTrainedAt: m.lastTrainedAt ? m.lastTrainedAt.toISOString() : null,
        hoursSinceLastTrained: m.hoursElapsed,
        recommendedRecoveryHours: m.recommendedRecoveryHours,
        remainingRecoveryHours: remainingHours,
        lastVolumeKg: m.lastSessionVolumeKg ?? 0,
        lastSetCount: m.lastSessionSets ?? 0,
        lastAvgRpe: m.lastSessionAvgRpe ?? null,
      };
    }
  );

  let overallReadiness: "ready" | "recovering" | "exhausted" = "ready";
  if (readiness.recoveringGroups.length > 0) {
    const hasExhausted = Object.values(readiness.muscles).some(
      (m) => m.status === "exhausted"
    );
    overallReadiness = hasExhausted ? "exhausted" : "recovering";
  }

  const readyGroupsMapped = readiness.readyGroups.map((g) =>
    g === "quads" ? "quadriceps" : g
  );
  const recoveringGroupsMapped = readiness.recoveringGroups.map((g) =>
    g === "quads" ? "quadriceps" : g
  );

  const remainingByGroup = Object.fromEntries(
    Object.entries(readiness.muscles).map(([k, v]) => [
      k,
      {
        remainingRecoveryHours:
          v.hoursElapsed !== null
            ? Math.max(0, v.recommendedRecoveryHours - v.hoursElapsed)
            : 0,
      },
    ])
  ) as Record<MuscleGroupKey, { remainingRecoveryHours: number }>;

  const message = buildRecommendationMessage(
    readiness.recommendationKey,
    readiness.readyGroups,
    readiness.recoveringGroups,
    remainingByGroup,
    lang
  );

  return {
    muscleGroups,
    overallReadiness,
    smartRecommendation: {
      status: overallReadiness,
      readyGroups: readyGroupsMapped,
      recoveringGroups: recoveringGroupsMapped,
      suggestedFocus:
        readyGroupsMapped.length > 0 ? readyGroupsMapped : ["full_body"],
      message,
    },
    userProfile: {
      gender: formatGenderLabel(userProfile?.gender),
      age: userAge,
      effectiveWeightKg: Math.round(effectiveWeightKg * 10) / 10,
    },
    muscles: readiness.muscles,
  };
}
