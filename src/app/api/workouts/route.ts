import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { listWorkouts } from "@/lib/services/workoutsService";
import { isServiceError } from "@/lib/services/errors";

export const GET = withAuth(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSizeParam = url.searchParams.get("pageSize") || url.searchParams.get("limit") || "20";
    const isAll = pageSizeParam === "all" || pageSizeParam === "-1";
    const pageSize: number | "all" = isAll ? "all" : parseInt(pageSizeParam, 10);
    const offset = url.searchParams.has("offset")
      ? Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10))
      : undefined;

    const result = await listWorkouts(user.id, { page, pageSize, offset });
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to list workouts:", msg);
    return NextResponse.json(
      { detail: "Failed to list workouts" },
      { status: 500 }
    );
  }
});
