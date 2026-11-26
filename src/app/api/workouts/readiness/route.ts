import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { getMuscleReadiness } from "@/lib/services/workoutsService";
import { isServiceError } from "@/lib/services/errors";

export const GET = withAuth(async (req, { user }) => {
  try {
    const fallbackLang = req.headers.get("accept-language")?.slice(0, 2) || "pt";
    const response = await getMuscleReadiness(user.id, { fallbackLang });
    return NextResponse.json(response);
  } catch (err: unknown) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to compute readiness:", msg);
    return NextResponse.json(
      { detail: "Failed to compute muscle readiness" },
      { status: 500 }
    );
  }
});
