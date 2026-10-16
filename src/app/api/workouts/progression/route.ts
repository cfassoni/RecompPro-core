import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { workouts } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { computeHistoricalProgressions } from "@/lib/exercises/recovery";

export const GET = withAuth(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const periodParam = (url.searchParams.get("period") || "1m").toLowerCase();

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

    return NextResponse.json({
      period: periodParam,
      items,
      totalPrsInPeriod,
      exercisesProgressedCount: items.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to fetch workout progressions:", msg);
    return NextResponse.json(
      { detail: "Failed to fetch workout progressions" },
      { status: 500 }
    );
  }
});
