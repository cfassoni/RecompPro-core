import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { workouts } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import type {
  WorkoutStatsResponse,
  WorkoutChartPoint,
  WorkoutCalendarItem,
} from "@/lib/api";

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

export const GET = withAuth(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const periodParam = url.searchParams.get("period") || "3m";
    const period = (["all", "1m", "3m", "6m", "1y"].includes(periodParam)
      ? periodParam
      : "3m") as "all" | "1m" | "3m" | "6m" | "1y";

    const lang = (
      req.headers.get("accept-language")?.slice(0, 2) || "pt"
    ).toLowerCase();

    // Fetch all workouts for the user with exercises and sets for reps calculation
    const allWorkouts = await db.query.workouts.findMany({
      where: eq(workouts.userId, user.id),
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

    // Calculate current week boundaries (Monday to Sunday)
    const currentDayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...
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

    // Calendar mapping (covers all workouts so calendar navigation is instant)
    const calendarDays: Record<string, WorkoutCalendarItem[]> = {};

    // Preprocess workouts with total reps
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

      // Current week metrics
      if (w.startTime >= startOfCurrentWeek && w.startTime <= endOfCurrentWeek) {
        currentWeekDurationSeconds += w.durationSeconds;
        currentWeekVolumeKg += w.totalVolumeKg;
        currentWeekReps += reps;
        currentWeekWorkoutsCount++;
      }

      return {
        ...w,
        reps,
      };
    });

    // Filter workouts for the selected time horizon
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

    // Aggregate summary for the filtered horizon
    const totalWorkouts = filteredWorkouts.length;
    let totalDurationSeconds = 0;
    let totalVolumeKg = 0;
    let totalReps = 0;

    for (const w of filteredWorkouts) {
      totalDurationSeconds += w.durationSeconds;
      totalVolumeKg += w.totalVolumeKg;
      totalReps += w.reps;
    }

    // Build Chart Buckets
    const chartData: WorkoutChartPoint[] = [];

    if (period === "1m" || period === "3m" || period === "6m") {
      // Weekly aggregation buckets
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
      // Monthly aggregation buckets for 1Y or All
      const monthCount = period === "1y" ? 12 : 12;

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

    const response: WorkoutStatsResponse = {
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

    return NextResponse.json(response);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to compute workout stats:", msg);
    return NextResponse.json(
      { detail: "Failed to compute workout statistics" },
      { status: 500 }
    );
  }
});
