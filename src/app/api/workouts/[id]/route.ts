import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { workouts } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import {
  computeHistoricalProgressions,
  inferMovementCategory,
  isAssistedBodyweightExercise,
  resolveAdaptiveRepBracket,
  sanitizeAndResolveEffectiveRpe,
  prescribeNextLoadStaticDoubleProgression,
} from "@/lib/exercises/recovery";

export const GET = withAuth(async (_req, { user, params }) => {
  try {
    const id = String(params?.id || "");
    if (!id) {
      return NextResponse.json({ detail: "Workout ID is required" }, { status: 400 });
    }

    const w = await db.query.workouts.findFirst({
      where: and(eq(workouts.id, id), eq(workouts.userId, user.id)),
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
      return NextResponse.json({ detail: "Workout not found" }, { status: 404 });
    }

    // Fetch all workouts to resolve chronological PRs
    const allUserWorkouts = await db.query.workouts.findMany({
      where: eq(workouts.userId, user.id),
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

    // Build enriched exercises
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

    return NextResponse.json({
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
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to fetch workout details:", msg);
    return NextResponse.json(
      { detail: "Failed to fetch workout details" },
      { status: 500 }
    );
  }
});
