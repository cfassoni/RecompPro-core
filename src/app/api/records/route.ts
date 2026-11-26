import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { listAllBiometricRecords } from "@/lib/services/biometricsService";
import { isServiceError } from "@/lib/services/errors";

export const GET = withAuth(async (_req, { user }) => {
  try {
    const formatted = await listAllBiometricRecords(user.id);
    return NextResponse.json(formatted);
  } catch (err) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    console.error("Get records error:", err);
    return NextResponse.json(
      { detail: "An error occurred while fetching records" },
      { status: 500 }
    );
  }
});
