import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { triggerFitdaysSync } from "@/lib/services/integrationsService";
import { isServiceError } from "@/lib/services/errors";

export const POST = withAuth(async (req, { user }) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { forceFull = false } = body;

    const result = await triggerFitdaysSync(user.id, { forceFull: Boolean(forceFull) });
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Sync Fitdays error:", msg);
    return NextResponse.json(
      { detail: `Failed to synchronize: ${msg}` },
      { status: 500 }
    );
  }
});
