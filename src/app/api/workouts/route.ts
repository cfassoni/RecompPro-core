import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { workouts } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

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

    const sanitized = list.map((w) => ({
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
    }));

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
