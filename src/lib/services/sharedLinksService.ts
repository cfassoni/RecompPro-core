import crypto from "crypto";
import { db } from "@/db/client";
import { recompRecords, sharedLinks } from "@/db/schema";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { generateSharedLinkToken, hashPassword } from "@/lib/auth";
import { safeToISOString } from "@/lib/dateUtils";
import { formatRecordResponse } from "@/lib/recordFormat";
import {
  formatSharedLinkResponse,
  recomputeSharedLinkSnapshot,
} from "@/lib/sharedLinkFormat";
import { ServiceError } from "./errors";

export interface CreateSharedLinkInput {
  description?: string;
  entry_ids?: number[];
  password?: string;
  include_attachments?: boolean;
  expires_at?: string | null;
  auto_share_starred?: boolean;
}

export interface UpdateSharedLinkInput {
  description?: string;
  expires_at?: string | null;
  clear_password?: boolean;
  password?: string;
  auto_share_starred?: boolean;
}

/**
 * Lists all shared links owned by the user in descending creation order.
 */
export async function listSharedLinks(userId: number) {
  const links = await db.query.sharedLinks.findMany({
    where: eq(sharedLinks.ownerId, userId),
    orderBy: [desc(sharedLinks.createdAt)],
    with: {
      auditLogs: true,
    },
  });

  return links.map((l) => formatSharedLinkResponse(l, l.auditLogs));
}

/**
 * Fetches formatted shared link metadata for REST responses.
 */
export async function getSharedLinkDetails(userId: number, linkId: string) {
  const id = String(linkId || "").trim();
  if (!id) {
    throw new ServiceError("Invalid link ID", 400, "INVALID_LINK_ID");
  }

  const link = await db.query.sharedLinks.findFirst({
    where: and(eq(sharedLinks.id, id), eq(sharedLinks.ownerId, userId)),
    with: {
      auditLogs: true,
    },
  });

  if (!link) {
    throw new ServiceError("Shared link not found", 404, "SHARED_LINK_NOT_FOUND");
  }

  return formatSharedLinkResponse(link, link.auditLogs);
}

/**
 * Fetches shared link details for MCP: includes record summaries and sanitized access audit summary (no visitor IP/UA).
 */
export async function getSharedLinkDetailsForMcp(
  userId: number,
  linkId: string,
  origin?: string
) {
  const id = String(linkId || "").trim();
  if (!id) {
    throw new ServiceError("Invalid link ID", 400, "INVALID_LINK_ID");
  }

  const link = await db.query.sharedLinks.findFirst({
    where: and(eq(sharedLinks.id, id), eq(sharedLinks.ownerId, userId)),
    with: {
      auditLogs: true,
    },
  });

  if (!link) {
    throw new ServiceError("Shared link not found", 404, "SHARED_LINK_NOT_FOUND");
  }

  let rawEntries: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(link.snapshotData);
    if (Array.isArray(parsed)) {
      rawEntries = parsed;
    }
  } catch {
    rawEntries = [];
  }

  const includedRecords = rawEntries.map((entry) => ({
    id: entry.id ?? null,
    date: entry.date ?? null,
    weight: entry.weight ?? null,
    bmi: entry.bmi ?? null,
    body_fat_pct: entry.body_fat_pct ?? null,
    muscle_mass: entry.muscle_mass ?? null,
    skeletal_muscle_mass: entry.skeletal_muscle_mass ?? null,
    has_report: Boolean(entry.report),
  }));

  const sortedLogs = [...link.auditLogs].sort(
    (a, b) => (b.accessedAt?.getTime() ?? 0) - (a.accessedAt?.getTime() ?? 0)
  );
  const successfulAccesses = sortedLogs.filter(
    (l) => l.status === "success" || l.status.startsWith("success")
  ).length;
  const failedAccesses = sortedLogs.length - successfulAccesses;

  const accessAuditSummary = {
    total_attempts: sortedLogs.length,
    successful_accesses: successfulAccesses,
    failed_accesses: failedAccesses,
    recent_events: sortedLogs.slice(0, 20).map((l) => ({
      accessed_at: safeToISOString(l.accessedAt),
      status: l.status,
    })),
  };

  return {
    ...formatSharedLinkResponse(link, link.auditLogs),
    ...(origin ? { share_url: `${origin}/shared/${link.token}` } : {}),
    included_records: includedRecords,
    access_audit_summary: accessAuditSummary,
  };
}

/**
 * Creates a snapshot shared link respecting MAX_ACTIVE_SHARED_LINKS and auto-share rules.
 */
export async function createSharedLink(
  userId: number,
  input: CreateSharedLinkInput
) {
  const {
    description,
    entry_ids,
    password,
    include_attachments = true,
    expires_at,
    auto_share_starred = false,
  } = input;

  const isAutoShare = Boolean(auto_share_starred);
  const manualIds = Array.isArray(entry_ids) ? entry_ids.map(Number) : [];

  if (!description || (!isAutoShare && manualIds.length === 0)) {
    throw new ServiceError(
      "Description and at least one entry_id are required",
      400,
      "VALIDATION_ERROR"
    );
  }

  const maxActiveLinks = parseInt(process.env.MAX_ACTIVE_SHARED_LINKS || "10", 10);
  const now = new Date();

  const activeLinks = await db.query.sharedLinks.findMany({
    where: and(
      eq(sharedLinks.ownerId, userId),
      or(isNull(sharedLinks.expiresAt), gt(sharedLinks.expiresAt, now))
    ),
  });

  if (activeLinks.length >= maxActiveLinks) {
    throw new ServiceError(
      `You have reached the maximum limit of ${maxActiveLinks} active shared links. Please revoke or let old links expire before creating a new one.`,
      400,
      "MAX_ACTIVE_SHARED_LINKS"
    );
  }

  let recordsWhere;
  if (isAutoShare) {
    if (manualIds.length > 0) {
      recordsWhere = and(
        eq(recompRecords.userId, userId),
        or(inArray(recompRecords.id, manualIds), eq(recompRecords.starred, true))
      );
    } else {
      recordsWhere = and(
        eq(recompRecords.userId, userId),
        eq(recompRecords.starred, true)
      );
    }
  } else {
    recordsWhere = and(
      eq(recompRecords.userId, userId),
      inArray(recompRecords.id, manualIds)
    );
  }

  const records = await db.query.recompRecords.findMany({
    where: recordsWhere,
    orderBy: [asc(recompRecords.date)],
    with: {
      report: true,
    },
  });

  if (!isAutoShare && (!records || records.length === 0)) {
    throw new ServiceError(
      "No valid records selected for sharing",
      400,
      "NO_VALID_RECORDS"
    );
  }

  const serializedEntries = records.map((r) => {
    const formatted = formatRecordResponse(r, r.report);
    if (r.report && formatted.report) {
      (formatted.report as Record<string, unknown>).file_path = r.report.filePath;
    }
    return formatted;
  });

  const token = generateSharedLinkToken();
  const passwordHash = password ? await hashPassword(password) : null;
  const linkId = crypto.randomUUID();

  const [newLink] = await db
    .insert(sharedLinks)
    .values({
      id: linkId,
      ownerId: userId,
      token,
      description,
      passwordHash,
      includeAttachments: Boolean(include_attachments),
      autoShareStarred: isAutoShare,
      manualEntryIds: JSON.stringify(manualIds),
      expiresAt: expires_at ? new Date(expires_at) : null,
      snapshotData: JSON.stringify(serializedEntries),
      createdAt: new Date(),
    })
    .returning();

  return formatSharedLinkResponse(newLink, []);
}

/**
 * Updates description, expiration, password, or auto-share behavior on a shared link.
 */
export async function updateSharedLink(
  userId: number,
  linkId: string,
  input: UpdateSharedLinkInput
) {
  const id = String(linkId || "").trim();
  if (!id) {
    throw new ServiceError("Invalid link ID", 400, "INVALID_LINK_ID");
  }

  const link = await db.query.sharedLinks.findFirst({
    where: and(eq(sharedLinks.id, id), eq(sharedLinks.ownerId, userId)),
    with: {
      auditLogs: true,
    },
  });

  if (!link) {
    throw new ServiceError("Shared link not found", 404, "SHARED_LINK_NOT_FOUND");
  }

  const { description, expires_at, clear_password, password, auto_share_starred } = input;
  const updates: Partial<typeof sharedLinks.$inferInsert> = {};

  if (description !== undefined) {
    updates.description = description;
  }

  if (expires_at !== undefined) {
    updates.expiresAt = expires_at ? new Date(expires_at) : null;
  }

  if (clear_password) {
    updates.passwordHash = null;
  } else if (password !== undefined && password !== "") {
    updates.passwordHash = await hashPassword(password);
  }

  if (auto_share_starred !== undefined) {
    updates.autoShareStarred = Boolean(auto_share_starred);
  }

  if (Object.keys(updates).length === 0) {
    return formatSharedLinkResponse(link, link.auditLogs);
  }

  const [updatedLink] = await db
    .update(sharedLinks)
    .set(updates)
    .where(eq(sharedLinks.id, id))
    .returning();

  let finalLink = updatedLink;
  if (auto_share_starred !== undefined) {
    finalLink = await recomputeSharedLinkSnapshot(updatedLink);
  }

  return formatSharedLinkResponse(finalLink, link.auditLogs);
}

/**
 * Permanently deletes a shared link owned by the user.
 */
export async function deleteSharedLink(userId: number, linkId: string): Promise<void> {
  const id = String(linkId || "").trim();
  if (!id) {
    throw new ServiceError("Invalid link ID", 400, "INVALID_LINK_ID");
  }

  const link = await db.query.sharedLinks.findFirst({
    where: and(eq(sharedLinks.id, id), eq(sharedLinks.ownerId, userId)),
  });

  if (!link) {
    throw new ServiceError("Shared link not found", 404, "SHARED_LINK_NOT_FOUND");
  }

  await db.delete(sharedLinks).where(eq(sharedLinks.id, id));
}
