import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import {
  deleteSharedLink,
  getSharedLinkDetails,
  updateSharedLink,
} from "@/lib/services/sharedLinksService";
import { isServiceError } from "@/lib/services/errors";

export const GET = withAuth(async (_req, { user, params }) => {
  try {
    const linkId = String(params?.id || "");
    const details = await getSharedLinkDetails(user.id, linkId);
    return NextResponse.json(details);
  } catch (err) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    console.error("Get shared link details error:", err);
    return NextResponse.json(
      { detail: "An error occurred while fetching shared link details" },
      { status: 500 }
    );
  }
});

export const PATCH = withAuth(async (req, { user, params }) => {
  try {
    const linkId = String(params?.id || "");
    const body = await req.json();
    const updated = await updateSharedLink(user.id, linkId, body);
    return NextResponse.json(updated);
  } catch (err) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    console.error("Update shared link error:", err);
    return NextResponse.json(
      { detail: "An error occurred while updating shared link" },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async (_req, { user, params }) => {
  try {
    const linkId = String(params?.id || "");
    await deleteSharedLink(user.id, linkId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    console.error("Delete shared link error:", err);
    return NextResponse.json(
      { detail: "An error occurred while deleting shared link" },
      { status: 500 }
    );
  }
});
