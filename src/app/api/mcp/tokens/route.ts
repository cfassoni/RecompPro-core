import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { mcpPersonalAccessTokens } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { isMcpServerEnabled } from "@/lib/featureFlags";
import { mcpDisabledResponse } from "@/lib/mcp/cors";
import { createPersonalAccessToken } from "@/lib/mcp/oauth/tokens";
import {
  isReadOnlyScopes,
  parseRequestedScopes,
  stripWriteScopes,
  validateRequestedScopes,
} from "@/lib/mcp/scopes";

export const GET = withAuth(async (_req, { user }) => {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  try {
    const now = new Date();
    const rows = await db.query.mcpPersonalAccessTokens.findMany({
      where: and(
        eq(mcpPersonalAccessTokens.userId, user.id),
        isNull(mcpPersonalAccessTokens.revokedAt)
      ),
      orderBy: [desc(mcpPersonalAccessTokens.createdAt)],
    });

    const tokens = rows.map((p) => {
      const scopes = parseRequestedScopes(p.scopes);
      return {
        id: p.id,
        name: p.name,
        tokenPrefix: p.tokenPrefix,
        scopes,
        readOnly: isReadOnlyScopes(scopes),
        lastUsedAt: p.lastUsedAt ? p.lastUsedAt.toISOString() : null,
        expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
        isExpired: Boolean(p.expiresAt && p.expiresAt <= now),
        createdAt: p.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ tokens });
  } catch (err) {
    console.error("Failed to list MCP PATs:", err);
    return NextResponse.json(
      { detail: "Failed to list personal access tokens" },
      { status: 500 }
    );
  }
});

interface CreatePatBody {
  name?: unknown;
  accessMode?: unknown;
  scopes?: unknown;
  expiresInDays?: unknown;
}

export const POST = withAuth(async (req, { user }) => {
  if (!isMcpServerEnabled()) {
    return mcpDisabledResponse();
  }

  try {
    const body = (await req.json()) as CreatePatBody;
    const rawName = typeof body.name === "string" ? body.name.trim() : "";
    if (!rawName || rawName.length > 80) {
      return NextResponse.json(
        { detail: "Token name must be between 1 and 80 characters" },
        { status: 400 }
      );
    }

    const accessMode =
      body.accessMode === "read_write" ? "read_write" : "read_only";

    let resolvedScopes: string[];
    if (Array.isArray(body.scopes) && body.scopes.length > 0) {
      if (!body.scopes.every((s) => typeof s === "string")) {
        return NextResponse.json(
          { detail: "scopes must be an array of scope strings" },
          { status: 400 }
        );
      }
      const check = validateRequestedScopes(body.scopes.join(" "));
      if (!check.ok) {
        return NextResponse.json(
          { detail: `Unsupported scope(s): ${check.unknown.join(", ")}` },
          { status: 400 }
        );
      }
      resolvedScopes =
        accessMode === "read_only" ? stripWriteScopes(check.scopes) : check.scopes;
    } else {
      resolvedScopes =
        accessMode === "read_write"
          ? ["recomp:read", "recomp:write"]
          : ["recomp:read"];
    }

    let expiresAt: Date | null = null;
    if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
      const days = Number(body.expiresInDays);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        return NextResponse.json(
          { detail: "expiresInDays must be an integer between 1 and 3650" },
          { status: 400 }
        );
      }
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const created = await createPersonalAccessToken({
      userId: user.id,
      name: rawName,
      scopes: resolvedScopes,
      expiresAt,
    });

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        token: created.token,
        tokenPrefix: created.tokenPrefix,
        scopes: created.scopes,
        readOnly: isReadOnlyScopes(created.scopes),
        expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
        createdAt: created.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Failed to create MCP PAT:", err);
    return NextResponse.json(
      { detail: "Failed to create personal access token" },
      { status: 500 }
    );
  }
});
