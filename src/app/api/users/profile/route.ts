import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { updateUserProfile } from "@/lib/services/profileService";
import { isServiceError } from "@/lib/services/errors";

export const PUT = withAuth(async (req, { user }) => {
  try {
    const body = await req.json();
    const updated = await updateUserProfile(user.id, body, { allowEmailChange: true });
    return NextResponse.json(updated);
  } catch (err) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    console.error("Update profile error:", err);
    return NextResponse.json(
      { detail: "An error occurred while updating profile" },
      { status: 500 }
    );
  }
});
