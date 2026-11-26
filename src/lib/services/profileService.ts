import { db } from "@/db/client";
import { users } from "@/db/schema";
import { and, eq, ne, or } from "drizzle-orm";
import { generateVerificationCode, getVerificationExpiry } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { formatUserResponse } from "@/lib/userFormat";
import { ServiceError } from "./errors";

export type UserProfileResponse = ReturnType<typeof formatUserResponse>;
export type McpUserProfileResponse = Omit<UserProfileResponse, "profile_image_path">;

export interface UpdateUserProfileInput {
  email?: string;
  display_name?: string | null;
  gender?: string | null;
  birthday?: string | null;
  height_cm?: number | string | null;
  target_weight_kg?: number | string | null;
  preferred_language?: string | null;
}

/**
 * Fetches a user's full profile formatted for REST API responses.
 */
export async function getUserProfile(userId: number): Promise<UserProfileResponse> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new ServiceError("User not found", 404, "USER_NOT_FOUND");
  }

  return formatUserResponse(user);
}

/**
 * Fetches a user's profile for MCP consumption, omitting internal filesystem paths.
 */
export async function getUserProfileForMcp(userId: number): Promise<McpUserProfileResponse> {
  const profile = await getUserProfile(userId);
  const { profile_image_path: _omitted, ...safeProfile } = profile;
  void _omitted;
  return safeProfile;
}

/**
 * Updates mutable profile fields. Email changes are restricted to explicit web flows.
 */
export async function updateUserProfile(
  userId: number,
  input: UpdateUserProfileInput,
  options?: { allowEmailChange?: boolean }
): Promise<UserProfileResponse> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new ServiceError("User not found", 404, "USER_NOT_FOUND");
  }

  const {
    email,
    display_name,
    gender,
    birthday,
    height_cm,
    target_weight_kg,
    preferred_language,
  } = input;

  const updates: Partial<typeof users.$inferInsert> = {};

  if (
    options?.allowEmailChange === true &&
    email &&
    email.toLowerCase().trim() !== user.email.toLowerCase().trim()
  ) {
    const cleanEmail = email.toLowerCase().trim();

    const existing = await db.query.users.findFirst({
      where: and(
        or(eq(users.email, cleanEmail), eq(users.pendingEmail, cleanEmail)),
        ne(users.id, user.id)
      ),
    });

    if (existing) {
      throw new ServiceError("Email already registered", 400, "EMAIL_ALREADY_REGISTERED");
    }

    const code = generateVerificationCode();
    const expiry = getVerificationExpiry();

    updates.pendingEmail = cleanEmail;
    updates.verificationCode = code;
    updates.verificationCodeExpiresAt = expiry;
    updates.verificationAttempts = 0;

    sendVerificationEmail(
      cleanEmail,
      code,
      preferred_language || user.preferredLanguage || "en",
      true
    ).catch((err) => console.error("Async email dispatch error:", err));
  }

  if (display_name !== undefined) updates.displayName = display_name;
  if (gender !== undefined) updates.gender = gender;
  if (birthday !== undefined) updates.birthday = birthday;
  if (height_cm !== undefined) {
    updates.heightCm = height_cm === null ? null : Number(height_cm);
  }
  if (target_weight_kg !== undefined) {
    updates.targetWeightKg = target_weight_kg === null ? null : Number(target_weight_kg);
  }
  if (preferred_language !== undefined) updates.preferredLanguage = preferred_language;

  if (Object.keys(updates).length === 0) {
    return formatUserResponse(user);
  }

  const [updatedUser] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.id))
    .returning();

  return formatUserResponse(updatedUser);
}
