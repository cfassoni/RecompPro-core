import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { getBiometricsSummary } from "@/lib/services/biometricsService";
import { isServiceError } from "@/lib/services/errors";

export const GET = withAuth(async (_req, { user }) => {
  try {
    const summary = await getBiometricsSummary(user.id);
    return NextResponse.json(summary);
  } catch (err) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    console.error("Summary error:", err);
    return NextResponse.json(
      { detail: "An error occurred while calculating summary" },
      { status: 500 }
    );
  }
});
