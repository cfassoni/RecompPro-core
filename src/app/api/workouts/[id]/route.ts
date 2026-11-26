import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { getWorkoutDetails } from "@/lib/services/workoutsService";
import { isServiceError } from "@/lib/services/errors";

export const GET = withAuth(async (_req, { user, params }) => {
  try {
    const id = String(params?.id || "");
    const details = await getWorkoutDetails(user.id, id);
    return NextResponse.json(details);
  } catch (err: unknown) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to fetch workout details:", msg);
    return NextResponse.json(
      { detail: "Failed to fetch workout details" },
      { status: 500 }
    );
  }
});
