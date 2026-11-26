import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { listIntegrations } from "@/lib/services/integrationsService";
import { isServiceError } from "@/lib/services/errors";

export const GET = withAuth(async (_req, { user }) => {
  try {
    const sanitized = await listIntegrations(user.id, { redactSecrets: false });
    return NextResponse.json(sanitized);
  } catch (err: unknown) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to list integrations:", msg);
    return NextResponse.json(
      { detail: "Failed to list integrations" },
      { status: 500 }
    );
  }
});
