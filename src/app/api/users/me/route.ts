import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { verifyPassword } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendAccountDeletedEmail } from "@/lib/email";
import { getUserProfile } from "@/lib/services/profileService";
import { isServiceError } from "@/lib/services/errors";
import fs from "fs";

export const GET = withAuth(async (_req, { user }) => {
  try {
    const profile = await getUserProfile(user.id);
    return NextResponse.json(profile);
  } catch (err) {
    if (isServiceError(err)) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    console.error("Get current user error:", err);
    return NextResponse.json({ detail: "An error occurred" }, { status: 500 });
  }
});

export const DELETE = withAuth(async (req, { user }) => {
  try {
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ detail: "Password is required" }, { status: 400 });
    }

    const isValid = await verifyPassword(password, user.hashedPassword);
    if (!isValid) {
      return NextResponse.json({ detail: "Incorrect password" }, { status: 400 });
    }

    const userEmail = user.email;
    const userLang = user.preferredLanguage || "en";
    const profilePic = user.profileImagePath;

    // Delete profile picture if on disk
    if (profilePic && fs.existsSync(profilePic)) {
      try {
        fs.unlinkSync(profilePic);
      } catch (err) {
        console.warn("Failed to remove avatar file:", err);
      }
    }

    // Delete user (cascades in SQLite foreign keys)
    await db.delete(users).where(eq(users.id, user.id));

    sendAccountDeletedEmail(userEmail, userLang).catch((err) =>
      console.error("Async email error:", err)
    );

    return NextResponse.json({
      message: "Account and all associated data have been permanently deleted.",
    });
  } catch (err) {
    console.error("Delete account error:", err);
    return NextResponse.json(
      { detail: "An error occurred during account deletion" },
      { status: 500 }
    );
  }
});
