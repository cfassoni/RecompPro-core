import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { triggerHevySync } from "@/lib/services/integrationsService";
import { isServiceError } from "@/lib/services/errors";

export const POST = withAuth(async (req, { user }) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { forceFull = false, pageSize = 10 } = body;

    const result = await triggerHevySync(user.id, {
      forceFull: Boolean(forceFull),
      pageSize,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to run Hevy sync:", msg);
    return NextResponse.json(
      { detail: "Failed to run Hevy sync" },
      { status: 500 }
    );
  }
});
