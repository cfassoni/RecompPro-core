import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { workouts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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
      exercises: w.exercises.map((ex) => ({
        id: ex.id,
        title: ex.title,
        index: ex.index,
        notes: ex.notes,
        supersetId: ex.supersetId,
        primaryMuscleGroup: ex.template?.primaryMuscleGroup ?? null,
        equipment: ex.template?.equipment ?? null,
        thumbnailUrl: ex.template?.thumbnailUrl ?? null,
        sets: ex.sets.map((s) => ({
          id: s.id,
          index: s.index,
          type: s.type,
          weightKg: s.weightKg,
          reps: s.reps,
          rpe: s.rpe,
          durationSeconds: s.durationSeconds,
          distanceMeters: s.distanceMeters,
          customMetric: s.customMetric,
        })),
      })),
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
