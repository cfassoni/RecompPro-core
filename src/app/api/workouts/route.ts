import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { workouts } from "@/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import {
  computeHistoricalProgressions,
  inferMovementCategory,
  isAssistedBodyweightExercise,
  sanitizeAndResolveEffectiveRpe,
} from "@/lib/exercises/recovery";

export const GET = withAuth(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

    const totalCountRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(workouts)
      .where(eq(workouts.userId, user.id));

    const total = totalCountRes[0]?.count ?? 0;

    // Fetch all user workouts chronologically to compute historical progression badges (PRs)
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

    const list = await db.query.workouts.findMany({
      where: eq(workouts.userId, user.id),
      orderBy: [desc(workouts.startTime)],
      limit,
      offset,
      with: {
        exercises: {
          with: {
            sets: true,
            template: true,
          },
        },
      },
    });

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

    return NextResponse.json({
      total,
      limit,
      offset,
      workouts: sanitized,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to list workouts:", msg);
    return NextResponse.json(
      { detail: "Failed to list workouts" },
      { status: 500 }
    );
  }
});
