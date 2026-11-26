import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { createSharedLink, listSharedLinks } from "@/lib/services/sharedLinksService";
import { isServiceError } from "@/lib/services/errors";

export const POST = withAuth(async (req, { user }) => {
  try {
    const body = await req.json();
    const created = await createSharedLink(user.id, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    console.error("Create shared link error:", err);
    return NextResponse.json(
      { detail: "An error occurred while creating shared link" },
      { status: 500 }
    );
  }
});

export const GET = withAuth(async (_req, { user }) => {
  try {
    const formatted = await listSharedLinks(user.id);
    return NextResponse.json(formatted);
  } catch (err) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    console.error("Get shared links error:", err);
    return NextResponse.json(
      { detail: "An error occurred while fetching shared links" },
      { status: 500 }
    );
  }
});
