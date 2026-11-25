import crypto from "crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mcpOauthGrants, mcpOauthTokens, users } from "@/db/schema";
import { ensureTablesExist } from "@/db/initDb";
import { createAccessToken, hashPassword } from "@/lib/auth";
import { verifyPkceS256 } from "@/lib/mcp/oauth/pkce";
import {
  clearCimdCache,
  isBlockedIp,
  isCimdClientId,
  resolveCimdClient,
} from "@/lib/mcp/oauth/cimd";
import { resetDcrRateLimits } from "@/lib/mcp/oauth/dcr";
import {
  createPersonalAccessToken,
  revokePersonalAccessToken,
} from "@/lib/mcp/oauth/tokens";
import {
  hasScope,
  isReadOnlyScopes,
  stripWriteScopes,
  validateRequestedScopes,
} from "@/lib/mcp/scopes";
import { authenticateMcpRequest } from "@/lib/mcp/auth";
import { POST as registerDcrHandler } from "@/app/oauth/register/route";
import { GET as validateAuthHandler } from "@/app/oauth/authorize/validate/route";
import { POST as decisionHandler } from "@/app/oauth/authorize/decision/route";
import { POST as tokenHandler } from "@/app/oauth/token/route";
import { POST as revokeHandler } from "@/app/oauth/revoke/route";

function createPkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
  return { verifier, challenge };
}

describe("MCP OAuth 2.1, PKCE, CIMD, DCR, Scopes & PAT", () => {
  let userId = 0;
  let userEmail = "";
  let userJwt = "";

  beforeAll(async () => {
    await ensureTablesExist();
    userEmail = `mcp_oauth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const hashedPassword = await hashPassword("StrongPass123!");
    const [inserted] = await db
      .insert(users)
      .values({
        email: userEmail,
        hashedPassword,
        displayName: "MCP OAuth User",
        emailConfirmed: true,
        preferredLanguage: "en",
      })
      .returning();
    userId = inserted.id;
    userJwt = await createAccessToken({
      sub: userEmail,
      userId,
      email: userEmail,
    });
  });

  beforeEach(() => {
    clearCimdCache();
    resetDcrRateLimits();
  });

  it("verifies PKCE S256 strictly and rejects invalid, tampered, or short verifiers", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256(`${verifier}x`, challenge)).toBe(false);
    expect(verifyPkceS256("too-short", challenge)).toBe(false);
    expect(verifyPkceS256(verifier, "")).toBe(false);
  });

  it("resolves hybrid hierarchical scopes and supports Read-Only downgrade", () => {
    const parsed = validateRequestedScopes("recomp:read biometrics:write");
    expect(parsed).toEqual({ ok: true, scopes: ["recomp:read", "biometrics:write"] });

    expect(hasScope(["recomp:read"], "workouts:read")).toBe(true);
    expect(hasScope(["recomp:read"], "workouts:write")).toBe(false);
    expect(hasScope(["biometrics:write"], "biometrics:write")).toBe(true);
    expect(hasScope(["biometrics:write"], "workouts:write")).toBe(false);

    const downgraded = stripWriteScopes(["recomp:read", "recomp:write", "biometrics:write"]);
    expect(downgraded).toEqual(["recomp:read"]);
    expect(isReadOnlyScopes(downgraded)).toBe(true);
    expect(stripWriteScopes(["biometrics:write"])).toEqual(["recomp:read"]);

    expect(validateRequestedScopes("recomp:read unknown:scope")).toEqual({
      ok: false,
      unknown: ["unknown:scope"],
    });
  });

  it("blocks private, loopback, link-local, metadata, and IPv4-mapped SSRF targets in CIMD", async () => {
    const blockedIps = [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
    ];
    for (const ip of blockedIps) {
      expect(isBlockedIp(ip), `Expected ${ip} to be blocked`).toBe(true);
    }
    expect(isBlockedIp("93.184.216.34")).toBe(false);

    expect(isCimdClientId("http://example.com/client.json")).toBe(false);
    expect(isCimdClientId("https://example.com/client.json#frag")).toBe(false);
    expect(isCimdClientId("https://example.com/client.json")).toBe(true);

    await expect(
      resolveCimdClient("https://127.0.0.1/client.json")
    ).rejects.toThrow(/blocked/i);

    await expect(
      resolveCimdClient("https://ssrf.example.com/client.json", {
        lookup: async () => [{ address: "169.254.169.254", family: 4 }],
      })
    ).rejects.toThrow(/blocked IP/i);

    await expect(
      resolveCimdClient("https://mismatch.example.com/client.json", {
        lookup: async () => [{ address: "93.184.216.34", family: 4 }],
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              client_id: "https://other.example.com/client.json",
              redirect_uris: ["https://other.example.com/cb"],
            }),
            { status: 200 }
          ),
      })
    ).rejects.toThrow(/mismatch/i);
  });

  it("resolves and caches valid CIMD metadata in memory", async () => {
    let fetchCount = 0;
    const clientId = `https://claude.example.com/oauth-${Date.now()}.json`;

    const deps = {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchFn: async () => {
        fetchCount += 1;
        return new Response(
          JSON.stringify({
            client_id: clientId,
            client_name: "Claude Web",
            client_uri: "https://claude.ai",
            redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          }),
          { status: 200 }
        );
      },
    };

    const first = await resolveCimdClient(clientId, deps);
    const second = await resolveCimdClient(clientId, deps);

    expect(first.clientName).toBe("Claude Web");
    expect(first.registrationType).toBe("cimd");
    expect(second.clientId).toBe(clientId);
    expect(fetchCount).toBe(1);
  });

  it("enforces RFC 7591 DCR validation and full OAuth 2.1 flow with refresh reuse revocation", async () => {
    // Reject non-loopback http redirect URI
    const badDcrReq = new NextRequest("http://localhost:3000/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Bad Client",
        redirect_uris: ["http://evil.example.com/callback"],
      }),
    });
    const badDcrRes = await registerDcrHandler(badDcrReq);
    expect(badDcrRes.status).toBe(400);

    // Valid DCR registration
    const redirectUri = "http://127.0.0.1:41234/callback";
    const dcrReq = new NextRequest("http://localhost:3000/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Gemini CLI Test",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
      }),
    });
    const dcrRes = await registerDcrHandler(dcrReq);
    expect(dcrRes.status).toBe(201);
    const dcrData = (await dcrRes.json()) as { client_id: string; client_name: string };
    expect(dcrData.client_id).toMatch(/^recomp_client_/);

    // Validate authorize query params
    const { verifier, challenge } = createPkcePair();
    const validateUrl = new URL("http://localhost:3000/oauth/authorize/validate");
    validateUrl.searchParams.set("response_type", "code");
    validateUrl.searchParams.set("client_id", dcrData.client_id);
    validateUrl.searchParams.set("redirect_uri", redirectUri);
    validateUrl.searchParams.set("code_challenge", challenge);
    validateUrl.searchParams.set("code_challenge_method", "S256");
    validateUrl.searchParams.set("scope", "recomp:read recomp:write");
    validateUrl.searchParams.set("resource", "http://localhost:3000/mcp");

    const valRes = await validateAuthHandler(new NextRequest(validateUrl));
    expect(valRes.status).toBe(200);
    const valJson = (await valRes.json()) as { valid: boolean; hasWriteScopes: boolean };
    expect(valJson.valid).toBe(true);
    expect(valJson.hasWriteScopes).toBe(true);

    // Approve with Read-Only downgrade toggled ON
    const decisionReq = new NextRequest("http://localhost:3000/oauth/authorize/decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userJwt}`,
      },
      body: JSON.stringify({
        approved: true,
        readOnly: true,
        client_id: dcrData.client_id,
        redirect_uri: redirectUri,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        scope: "recomp:read recomp:write",
        state: "xyz123",
        resource: "http://localhost:3000/mcp",
      }),
    });
    const decisionRes = await decisionHandler(decisionReq);
    expect(decisionRes.status).toBe(200);
    const decisionJson = (await decisionRes.json()) as { redirectUrl: string };
    const callbackUrl = new URL(decisionJson.redirectUrl);
    const authCode = callbackUrl.searchParams.get("code") || "";
    expect(authCode).toMatch(/^recomp_ac_/);
    expect(callbackUrl.searchParams.get("state")).toBe("xyz123");

    // Exchange authorization code for access + refresh tokens
    const tokenRes = await tokenHandler(
      new NextRequest("http://localhost:3000/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: authCode,
          client_id: dcrData.client_id,
          redirect_uri: redirectUri,
          code_verifier: verifier,
          resource: "http://localhost:3000/mcp",
        }).toString(),
      })
    );
    expect(tokenRes.status).toBe(200);
    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      scope: string;
    };
    expect(tokenData.access_token).toMatch(/^recomp_at_/);
    expect(tokenData.refresh_token).toMatch(/^recomp_rt_/);
    expect(tokenData.scope).toBe("recomp:read");

    // Authenticate with access token
    const authCtx = await authenticateMcpRequest(
      new NextRequest("http://localhost:3000/mcp", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
    );
    expect(authCtx).not.toBeNull();
    expect(authCtx?.userId).toBe(userId);
    expect(authCtx?.authMethod).toBe("oauth");
    expect(authCtx?.scopes).toEqual(["recomp:read"]);

    // Rotate refresh token
    const refreshRes = await tokenHandler(
      new NextRequest("http://localhost:3000/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenData.refresh_token,
          client_id: dcrData.client_id,
        }).toString(),
      })
    );
    expect(refreshRes.status).toBe(200);
    const rotatedData = (await refreshRes.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(rotatedData.refresh_token).not.toBe(tokenData.refresh_token);

    // Replay the OLD rotated refresh token -> MUST revoke entire token family + grant
    const replayRes = await tokenHandler(
      new NextRequest("http://localhost:3000/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenData.refresh_token,
          client_id: dcrData.client_id,
        }).toString(),
      })
    );
    expect(replayRes.status).toBe(400);

    // Even the newly rotated access token must now be rejected because the grant was revoked
    const afterReuseAuth = await authenticateMcpRequest(
      new NextRequest("http://localhost:3000/mcp", {
        headers: { Authorization: `Bearer ${rotatedData.access_token}` },
      })
    );
    expect(afterReuseAuth).toBeNull();

    const grantRow = await db.query.mcpOauthGrants.findFirst({
      where: eq(mcpOauthGrants.clientId, dcrData.client_id),
    });
    expect(grantRow?.revokedAt).not.toBeNull();

    const familyTokens = await db.query.mcpOauthTokens.findMany({
      where: eq(mcpOauthTokens.clientId, dcrData.client_id),
    });
    expect(familyTokens.every((t) => t.revokedAt !== null)).toBe(true);

    // Test explicit revocation endpoint on a fresh PAT / token
    const revokeRes = await revokeHandler(
      new NextRequest("http://localhost:3000/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: rotatedData.refresh_token }).toString(),
      })
    );
    expect(revokeRes.status).toBe(200);
  });

  it("supports Personal Access Tokens (PAT) creation, authentication, expiry, and revocation", async () => {
    const created = await createPersonalAccessToken({
      userId,
      name: "Antigravity Local",
      scopes: ["recomp:read", "biometrics:write"],
    });
    expect(created.token).toMatch(/^recomp_pat_/);

    const ctx = await authenticateMcpRequest(
      new NextRequest("http://localhost:3000/mcp", {
        headers: { Authorization: `Bearer ${created.token}` },
      })
    );
    expect(ctx?.authMethod).toBe("pat");
    expect(ctx?.clientLabel).toBe("Antigravity Local");
    expect(ctx?.scopes).toEqual(["recomp:read", "biometrics:write"]);

    const revoked = await revokePersonalAccessToken(created.id, userId);
    expect(revoked).toBe(true);

    const afterRevoke = await authenticateMcpRequest(
      new NextRequest("http://localhost:3000/mcp", {
        headers: { Authorization: `Bearer ${created.token}` },
      })
    );
    expect(afterRevoke).toBeNull();

    const expiredPat = await createPersonalAccessToken({
      userId,
      name: "Expired PAT",
      scopes: ["recomp:read"],
      expiresAt: new Date(Date.now() - 60_000),
    });
    const expiredAuth = await authenticateMcpRequest(
      new NextRequest("http://localhost:3000/mcp", {
        headers: { Authorization: `Bearer ${expiredPat.token}` },
      })
    );
    expect(expiredAuth).toBeNull();
  });
});
