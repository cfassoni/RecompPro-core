import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { getWorkoutStats, WorkoutsPeriod } from "@/lib/services/workoutsService";
import { isServiceError } from "@/lib/services/errors";

export const GET = withAuth(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const periodParam = url.searchParams.get("period") || "3m";
    const period = (["all", "1m", "3m", "6m", "1y"].includes(periodParam)
      ? periodParam
      : "3m") as WorkoutsPeriod;

    const lang = (
      req.headers.get("accept-language")?.slice(0, 2) || "pt"
    ).toLowerCase();

    const response = await getWorkoutStats(user.id, { period, lang });
    return NextResponse.json(response);
  } catch (err: unknown) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to compute workout stats:", msg);
    return NextResponse.json(
      { detail: "Failed to compute workout statistics" },
      { status: 500 }
    );
  }
});
