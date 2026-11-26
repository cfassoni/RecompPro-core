import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { toggleBiometricRecordStar } from "@/lib/services/biometricsService";
import { isServiceError } from "@/lib/services/errors";

export const POST = withAuth(async (req, { user, params }) => {
  try {
    const recordId = Number(params?.id);
    if (!recordId) {
      return NextResponse.json({ detail: "Invalid record ID" }, { status: 400 });
    }

    let starred: boolean | undefined;
    try {
      const body = await req.json();
      if (typeof body?.starred === "boolean") {
        starred = body.starred;
      }
    } catch {
      // Empty body triggers toggle
    }

    const result = await toggleBiometricRecordStar(user.id, recordId, starred);
    return NextResponse.json(result);
  } catch (err) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    console.error("Toggle record star error:", err);
    return NextResponse.json(
      { detail: "An error occurred while toggling star" },
      { status: 500 }
    );
  }
});
