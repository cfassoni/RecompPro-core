import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { deleteBiometricRecords } from "@/lib/services/biometricsService";
import { isServiceError } from "@/lib/services/errors";

export const POST = withAuth(async (req, { user }) => {
  try {
    const body = await req.json();
    const ids = body.record_ids || body.ids;

    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json(
        { detail: "record_ids or ids must be an array of numbers" },
        { status: 400 }
      );
    }

    const result = await deleteBiometricRecords(user.id, ids);
    return NextResponse.json(result);
  } catch (err) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    console.error("Delete records error:", err);
    return NextResponse.json(
      { detail: "An error occurred while deleting records" },
      { status: 500 }
    );
  }
});
