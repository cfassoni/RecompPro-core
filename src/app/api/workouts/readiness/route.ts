import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { workouts, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  computeReadinessSummary,
  WorkoutHistoryItemForRecovery,
} from "@/lib/exercises/recovery";

export const GET = withAuth(async (_req, { user }) => {
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const userProfile = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });

    const recentWorkouts = await db.query.workouts.findMany({
      where: eq(workouts.userId, user.id),
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

    const mappedHistory: WorkoutHistoryItemForRecovery[] = recentWorkouts.map((w) => ({
      endTime: w.endTime,
      exercises: w.exercises.map((ex) => ({
        primaryMuscleGroup: ex.template?.primaryMuscleGroup ?? null,
        sets: ex.sets.map((s) => ({
          type: s.type,
          rpe: s.rpe,
          reps: s.reps,
        })),
      })),
    }));

    const readiness = computeReadinessSummary(mappedHistory, {
      gender: userProfile?.gender ?? null,
      birthday: userProfile?.birthday ?? null,
    });

    return NextResponse.json(readiness);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to compute readiness:", msg);
    return NextResponse.json(
      { detail: "Failed to compute muscle readiness" },
      { status: 500 }
    );
  }
});
