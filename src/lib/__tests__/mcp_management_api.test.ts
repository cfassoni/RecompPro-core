import crypto from "crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/db/client";
import {
  mcpAuditLogs,
  mcpOauthClients,
  mcpOauthGrants,
  mcpOauthTokens,
  users,
} from "@/db/schema";
import { ensureTablesExist } from "@/db/initDb";
import { createAccessToken, hashPassword } from "@/lib/auth";
import { generateOpaqueToken, ACCESS_TOKEN_PREFIX, sha256Hex } from "@/lib/mcp/oauth/tokens";
import { GET as getOverview } from "@/app/api/mcp/overview/route";
import { GET as getTokens, POST as createToken } from "@/app/api/mcp/tokens/route";
import { DELETE as deleteToken } from "@/app/api/mcp/tokens/[id]/route";
import { DELETE as deleteGrant } from "@/app/api/mcp/grants/[id]/route";
import { GET as getAuditLogs } from "@/app/api/mcp/audit-logs/route";
import { POST as mcpPost } from "@/app/mcp/route";

describe("MCP Phase 4: Management API Routes (/api/mcp/*)", () => {
  const originalEnableFlag = process.env.ENABLE_MCP_SERVER;

  let user1Id = 0;
  let user1Jwt = "";
  let user2Jwt = "";
  let grant1Id = "";
  let rawOauthAccessToken = "";

  beforeAll(async () => {
    await ensureTablesExist();
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const hashedPassword = await hashPassword("StrongPass123!");

    const [u1] = await db
      .insert(users)
      .values({
        email: `mcp_mgmt_u1_${suffix}@example.com`,
        hashedPassword,
        displayName: "Mgmt User 1",
        emailConfirmed: true,
        preferredLanguage: "en",
      })
      .returning();
    user1Id = u1.id;

    const [u2] = await db
      .insert(users)
      .values({
        email: `mcp_mgmt_u2_${suffix}@example.com`,
        hashedPassword,
        displayName: "Mgmt User 2",
        emailConfirmed: true,
        preferredLanguage: "en",
      })
      .returning();

    user1Jwt = await createAccessToken({ sub: u1.email, userId: u1.id, email: u1.email });
    user2Jwt = await createAccessToken({ sub: u2.email, userId: u2.id, email: u2.email });

    const clientId = `https://claude.example.com/oauth-${suffix}.json`;
    await db.insert(mcpOauthClients).values({
      clientId,
      registrationType: "cimd",
      clientName: "Claude Web",
      clientUri: "https://claude.ai",
      redirectUrisJson: JSON.stringify(["https://claude.ai/api/mcp/auth_callback"]),
    });

    grant1Id = crypto.randomUUID();
    await db.insert(mcpOauthGrants).values({
      id: grant1Id,
      userId: user1Id,
      clientId,
      grantedScopes: "recomp:read recomp:write",
    });

    rawOauthAccessToken = generateOpaqueToken(ACCESS_TOKEN_PREFIX);
    await db.insert(mcpOauthTokens).values({
      grantId: grant1Id,
      userId: user1Id,
      clientId,
      tokenType: "access",
      tokenHash: sha256Hex(rawOauthAccessToken),
      familyId: crypto.randomUUID(),
      scope: "recomp:read recomp:write",
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });

    await db.insert(mcpAuditLogs).values([
      {
        userId: user1Id,
        authMethod: "oauth",
        clientLabel: "Claude Web",
        primitiveType: "tool",
        primitiveName: "about",
        accessMode: "read",
        status: "success",
        durationMs: 12,
      },
      {
        userId: u2.id,
        authMethod: "pat",
        clientLabel: "Other Secret Client",
        primitiveType: "tool",
        primitiveName: "get_user_profile",
        accessMode: "read",
        status: "success",
        durationMs: 5,
      },
    ]);
  });

  afterEach(() => {
    if (originalEnableFlag === undefined) {
      delete process.env.ENABLE_MCP_SERVER;
    } else {
      process.env.ENABLE_MCP_SERVER = originalEnableFlag;
    }
  });

  it("creates, lists, uses, and revokes Personal Access Tokens with strict ownership", async () => {
    // 1. Invalid scopes rejected with 400
    const badRes = await createToken(
      new NextRequest("https://recomp.example.com/api/mcp/tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user1Jwt}`,
        },
        body: JSON.stringify({
          name: "Bad Token",
          accessMode: "read_only",
          scopes: ["admin:root"],
        }),
      })
    );
    expect(badRes.status).toBe(400);

    // 2. Create Read-Only PAT with 30-day expiration
    const createRes = await createToken(
      new NextRequest("https://recomp.example.com/api/mcp/tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user1Jwt}`,
        },
        body: JSON.stringify({
          name: "Antigravity CLI",
          accessMode: "read_only",
          expiresInDays: 30,
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      name: string;
      token: string;
      tokenPrefix: string;
      readOnly: boolean;
      scopes: string[];
    };
    expect(created.name).toBe("Antigravity CLI");
    expect(created.token.startsWith("recomp_pat_")).toBe(true);
    expect(created.readOnly).toBe(true);
    expect(created.scopes).toEqual(["recomp:read"]);

    // 3. List tokens must never expose tokenHash or raw token
    const listRes = await getTokens(
      new NextRequest("https://recomp.example.com/api/mcp/tokens", {
        headers: { Authorization: `Bearer ${user1Jwt}` },
      })
    );
    expect(listRes.status).toBe(200);
    const listText = await listRes.text();
    expect(listText).not.toContain(created.token);
    expect(listText).not.toContain("tokenHash");

    // 4. Verify PAT works against /mcp
    const mcpOkRes = await mcpPost(
      new NextRequest("https://recomp.example.com/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${created.token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      })
    );
    expect(mcpOkRes.status).toBe(200);

    // 5. Cross-user revocation fails with 404
    const crossRevokeRes = await deleteToken(
      new NextRequest(`https://recomp.example.com/api/mcp/tokens/${created.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user2Jwt}` },
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(crossRevokeRes.status).toBe(404);

    // 6. Owner revocation succeeds & invalidates PAT on /mcp
    const revokeRes = await deleteToken(
      new NextRequest(`https://recomp.example.com/api/mcp/tokens/${created.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user1Jwt}` },
      }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(revokeRes.status).toBe(200);

    const mcpRevokedRes = await mcpPost(
      new NextRequest("https://recomp.example.com/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${created.token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      })
    );
    expect(mcpRevokedRes.status).toBe(401);
  });

  it("returns scoped overview + audit logs and revokes OAuth grants + cascading tokens", async () => {
    const overviewRes = await getOverview(
      new NextRequest("https://recomp.example.com/api/mcp/overview", {
        headers: { Authorization: `Bearer ${user1Jwt}` },
      })
    );
    expect(overviewRes.status).toBe(200);
    const overview = (await overviewRes.json()) as {
      endpointUrl: string;
      grants: Array<{ id: string; clientName: string; readOnly: boolean }>;
      auditLogs: Array<{ clientLabel: string }>;
    };
    expect(overview.endpointUrl).toBe("https://recomp.example.com/mcp");
    expect(overview.grants.some((g) => g.id === grant1Id && !g.readOnly)).toBe(true);
    expect(overview.auditLogs.some((l) => l.clientLabel === "Claude Web")).toBe(true);
    expect(overview.auditLogs.some((l) => l.clientLabel === "Other Secret Client")).toBe(false);

    // Audit logs endpoint
    const logsRes = await getAuditLogs(
      new NextRequest("https://recomp.example.com/api/mcp/audit-logs?limit=10", {
        headers: { Authorization: `Bearer ${user1Jwt}` },
      })
    );
    expect(logsRes.status).toBe(200);
    const logsJson = (await logsRes.json()) as { logs: Array<{ clientLabel: string }> };
    expect(logsJson.logs.some((l) => l.clientLabel === "Other Secret Client")).toBe(false);

    // Cross-user grant revocation fails with 404
    const crossGrantRes = await deleteGrant(
      new NextRequest(`https://recomp.example.com/api/mcp/grants/${grant1Id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user2Jwt}` },
      }),
      { params: Promise.resolve({ id: grant1Id }) }
    );
    expect(crossGrantRes.status).toBe(404);

    // Owner revokes OAuth grant -> cascades to access token -> /mcp returns 401
    const revokeGrantRes = await deleteGrant(
      new NextRequest(`https://recomp.example.com/api/mcp/grants/${grant1Id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user1Jwt}` },
      }),
      { params: Promise.resolve({ id: grant1Id }) }
    );
    expect(revokeGrantRes.status).toBe(200);

    const mcpDeniedRes = await mcpPost(
      new NextRequest("https://recomp.example.com/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${rawOauthAccessToken}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/list",
          params: {},
        }),
      })
    );
    expect(mcpDeniedRes.status).toBe(401);
  });

  it("returns 503 on management routes when ENABLE_MCP_SERVER=false", async () => {
    process.env.ENABLE_MCP_SERVER = "false";

    const res = await getOverview(
      new NextRequest("https://recomp.example.com/api/mcp/overview", {
        headers: { Authorization: `Bearer ${user1Jwt}` },
      })
    );
    expect(res.status).toBe(503);
  });
});
