import { db } from "@/db/client";
import {
  exerciseTemplates,
  workouts,
  workoutExercises,
  workoutSets,
  recompRecords,
  users,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { HevyClient, HevyWorkout } from "./client";
import { calculateWorkoutCalories } from "../exercises/calories";
import { parseFlexibleDate } from "../dateUtils";

export interface SyncHevyWorkoutsResult {
  inserted: number;
  updated: number;
  total: number;
  exerciseTemplatesCount: number;
}

/**
 * Synchronizes all exercise templates from Hevy into SQLite.
 */
export async function syncExerciseTemplates(
  client: HevyClient,
  userId?: number | null
): Promise<number> {
  let page = 1;
  let pageCount = 1;
  let totalSaved = 0;

  while (page <= pageCount) {
    const res = await client.getExerciseTemplates(page, 100);
    pageCount = res.page_count;

    for (const tpl of res.exercise_templates) {
      const existing = await db.query.exerciseTemplates.findFirst({
        where: eq(exerciseTemplates.id, tpl.id),
      });

      const secondaryJson = tpl.secondary_muscle_groups
        ? JSON.stringify(tpl.secondary_muscle_groups)
        : null;

      if (!existing) {
        await db.insert(exerciseTemplates).values({
          id: tpl.id,
          userId: tpl.is_custom ? userId ?? null : null,
          title: tpl.title,
          primaryMuscleGroup: tpl.primary_muscle_group ?? null,
          secondaryMuscleGroupsJson: secondaryJson,
          equipment: tpl.equipment ?? null,
          isCustom: tpl.is_custom ?? false,
          thumbnailUrl: tpl.thumbnail_url ?? null,
        });
        totalSaved++;
      } else {
        await db
          .update(exerciseTemplates)
          .set({
            title: tpl.title,
            primaryMuscleGroup: tpl.primary_muscle_group ?? null,
            secondaryMuscleGroupsJson: secondaryJson,
            equipment: tpl.equipment ?? null,
            isCustom: tpl.is_custom ?? false,
            thumbnailUrl: tpl.thumbnail_url ?? null,
          })
          .where(eq(exerciseTemplates.id, tpl.id));
        totalSaved++;
      }
    }

    page++;
  }

  return totalSaved;
}

/**
 * Fetches user biometric context for personalized caloric computation.
 */
async function getUserBiometricContext(userId: number) {
  const latestRecord = await db.query.recompRecords.findFirst({
    where: eq(recompRecords.userId, userId),
    orderBy: [desc(recompRecords.date)],
  });

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const weightKg = latestRecord?.weight ?? user?.targetWeightKg ?? 75;
  const fatFreeMassKg = latestRecord?.fatFreeMass ?? null;
  const fatMassKg = latestRecord?.fatMass ?? null;

  return { weightKg, fatFreeMassKg, fatMassKg };
}

/**
 * Upserts a single Hevy workout, its exercises, and sets into SQLite.
 */
export async function upsertHevyWorkout(
  workout: HevyWorkout,
  userId: number
): Promise<"inserted" | "updated"> {
  const biometrics = await getUserBiometricContext(userId);

  const startDate = parseFlexibleDate(workout.start_time) || new Date();
  const endDate = parseFlexibleDate(workout.end_time) || new Date();
  const durationSeconds = Math.max(
    0,
    Math.floor((endDate.getTime() - startDate.getTime()) / 1000)
  );

  // Compute total volume
  let totalVolumeKg = 0;
  for (const ex of workout.exercises || []) {
    for (const set of ex.sets || []) {
      if (set.type !== "warmup" && set.weight_kg && set.reps) {
        totalVolumeKg += set.weight_kg * set.reps;
      }
    }
  }

  // Pre-load primary muscle groups for exercises from template if available
  const exercisesWithMuscleGroup = await Promise.all(
    (workout.exercises || []).map(async (ex) => {
      let primaryMuscleGroup: string | null = null;
      if (ex.exercise_template_id) {
        const tpl = await db.query.exerciseTemplates.findFirst({
          where: eq(exerciseTemplates.id, ex.exercise_template_id),
        });
        primaryMuscleGroup = tpl?.primaryMuscleGroup ?? null;
      }
      return {
        ...ex,
        primaryMuscleGroup,
      };
    })
  );

  // Calculate calories using the scientific bi-phasic engine with EPOC
  const caloricResult = calculateWorkoutCalories({
    weightKg: biometrics.weightKg,
    fatFreeMassKg: biometrics.fatFreeMassKg,
    fatMassKg: biometrics.fatMassKg,
    durationSeconds: durationSeconds > 0 ? durationSeconds : 3600,
    exercises: exercisesWithMuscleGroup.map((ex) => ({
      primaryMuscleGroup: ex.primaryMuscleGroup,
      sets: (ex.sets || []).map((s) => ({
        type: s.type,
        reps: s.reps,
        weightKg: s.weight_kg,
        rpe: s.rpe,
        durationSeconds: s.duration_seconds,
      })),
    })),
  });

  const existing = await db.query.workouts.findFirst({
    where: and(eq(workouts.id, workout.id), eq(workouts.userId, userId)),
  });

  let action: "inserted" | "updated" = "inserted";

  if (!existing) {
    await db.insert(workouts).values({
      id: workout.id,
      userId,
      title: workout.title || "Workout",
      description: workout.description ?? null,
      startTime: startDate,
      endTime: endDate,
      durationSeconds,
      totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
      sessionCaloriesBurned: caloricResult.sessionKcal,
      epocCaloriesBurned: caloricResult.epocKcal,
      totalCaloriesBurned: caloricResult.totalKcal,
      avgRpe: caloricResult.avgRpe,
      source: "hevy",
    });
  } else {
    action = "updated";
    await db
      .update(workouts)
      .set({
        title: workout.title || "Workout",
        description: workout.description ?? null,
        startTime: startDate,
        endTime: endDate,
        durationSeconds,
        totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
        sessionCaloriesBurned: caloricResult.sessionKcal,
        epocCaloriesBurned: caloricResult.epocKcal,
        totalCaloriesBurned: caloricResult.totalKcal,
        avgRpe: caloricResult.avgRpe,
        updatedAt: new Date(),
      })
      .where(eq(workouts.id, workout.id));

    // Remove existing exercises and sets to replace cleanly
    await db.delete(workoutExercises).where(eq(workoutExercises.workoutId, workout.id));
  }

  // Insert exercises and sets
  for (let exIdx = 0; exIdx < (workout.exercises || []).length; exIdx++) {
    const ex = workout.exercises[exIdx];
    const insertedEx = await db
      .insert(workoutExercises)
      .values({
        workoutId: workout.id,
        exerciseTemplateId: ex.exercise_template_id ?? null,
        title: ex.title,
        index: ex.index ?? exIdx,
        notes: ex.notes ?? null,
        supersetId: ex.superset_id ?? ex.supersets_id ?? null,
      })
      .returning({ id: workoutExercises.id });

    const workoutExerciseId = insertedEx[0]?.id;
    if (workoutExerciseId && ex.sets && ex.sets.length > 0) {
      for (let sIdx = 0; sIdx < ex.sets.length; sIdx++) {
        const s = ex.sets[sIdx];
        await db.insert(workoutSets).values({
          workoutExerciseId,
          index: s.index ?? sIdx,
          type: s.type || "normal",
          weightKg: s.weight_kg ?? null,
          reps: s.reps ?? null,
          distanceMeters: s.distance_meters ?? null,
          durationSeconds: s.duration_seconds ?? null,
          rpe: s.rpe ?? null,
          customMetric: s.custom_metric ?? null,
        });
      }
    }
  }

  return action;
}

/**
 * Deletes a workout from SQLite.
 */
export async function deleteHevyWorkout(workoutId: string, userId: number): Promise<boolean> {
  const existing = await db.query.workouts.findFirst({
    where: and(eq(workouts.id, workoutId), eq(workouts.userId, userId)),
  });

  if (!existing) return false;

  await db.delete(workouts).where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));
  return true;
}

/**
 * Orchestrates full or incremental synchronization of workouts from Hevy.
 */
export async function syncHevyWorkouts(
  client: HevyClient,
  userId: number,
  options: { forceFull?: boolean; pageSize?: number } = {}
): Promise<SyncHevyWorkoutsResult> {
  const { forceFull = false, pageSize = 10 } = options;

  // Step 1: Ensure exercise templates are up to date
  const exerciseTemplatesCount = await syncExerciseTemplates(client, userId);

  let inserted = 0;
  let updated = 0;
  let total = 0;

  let page = 1;
  let pageCount = 1;
  let shouldContinue = true;

  while (page <= pageCount && shouldContinue) {
    const res = await client.getWorkouts(page, pageSize);
    pageCount = res.page_count;

    if (!res.workouts || res.workouts.length === 0) {
      break;
    }

    for (const w of res.workouts) {
      total++;
      if (!forceFull) {
        // In incremental sync, if we hit a workout that already exists,
        // we can still update it or stop if older than last synced
        const existing = await db.query.workouts.findFirst({
          where: and(eq(workouts.id, w.id), eq(workouts.userId, userId)),
        });

        const action = await upsertHevyWorkout(w, userId);
        if (action === "inserted") inserted++;
        else updated++;

        if (existing && page > 2) {
          // If we reached previously imported pages in incremental mode, stop
          shouldContinue = false;
          break;
        }
      } else {
        const action = await upsertHevyWorkout(w, userId);
        if (action === "inserted") inserted++;
        else updated++;
      }
    }

    page++;
  }

  return { inserted, updated, total, exerciseTemplatesCount };
}
