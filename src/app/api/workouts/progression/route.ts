import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { getWorkoutProgression, WorkoutsPeriod } from "@/lib/services/workoutsService";
import { isServiceError } from "@/lib/services/errors";

export const GET = withAuth(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const periodParam = (url.searchParams.get("period") || "1m").toLowerCase() as WorkoutsPeriod;

    const result = await getWorkoutProgression(user.id, { period: periodParam });
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to fetch workout progressions:", msg);
    return NextResponse.json(
      { detail: "Failed to fetch workout progressions" },
      { status: 500 }
    );
  }
});
