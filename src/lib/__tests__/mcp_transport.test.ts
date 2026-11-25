import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ensureTablesExist } from "@/db/initDb";
import { hashPassword } from "@/lib/auth";
import { createPersonalAccessToken } from "@/lib/mcp/oauth/tokens";
import {
  GET as getProtectedResource,
  OPTIONS as optionsProtectedResource,
} from "@/app/.well-known/oauth-protected-resource/route";
import { GET as getProtectedResourceMcp } from "@/app/.well-known/oauth-protected-resource/mcp/route";
import {
  GET as getAuthServerMeta,
  OPTIONS as optionsAuthServerMeta,
} from "@/app/.well-known/oauth-authorization-server/route";
import {
  POST as mcpPost,
  GET as mcpGet,
  OPTIONS as mcpOptions,
} from "@/app/mcp/route";
import { GET as iconGet, HEAD as iconHead } from "@/app/icon.png/route";

async function parseMcpResponse(res: Response): Promise<Record<string, unknown>> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await res.json()) as Record<string, unknown>;
  }
  const text = await res.text();
  const dataLines = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  return JSON.parse(dataLines[dataLines.length - 1]) as Record<string, unknown>;
}

describe("MCP Streamable HTTP Transport, Discovery, CORS & Icon", () => {
  const originalEnableFlag = process.env.ENABLE_MCP_SERVER;
  let patToken = "";

  beforeAll(async () => {
    await ensureTablesExist();
    const email = `mcp_transport_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const hashedPassword = await hashPassword("StrongPass123!");
    const [user] = await db
      .insert(users)
      .values({
        email,
        hashedPassword,
        displayName: "Transport Tester",
        emailConfirmed: true,
        preferredLanguage: "en",
      })
      .returning();

    const pat = await createPersonalAccessToken({
      userId: user.id,
      name: "Vitest Client",
      scopes: ["recomp:read"],
    });
    patToken = pat.token;
  });

  afterEach(() => {
    if (originalEnableFlag === undefined) {
      delete process.env.ENABLE_MCP_SERVER;
    } else {
      process.env.ENABLE_MCP_SERVER = originalEnableFlag;
    }
  });

  it("serves RFC 9728 and RFC 8414 discovery metadata and CORS OPTIONS 204", async () => {
    const prRes = await getProtectedResource(
      new NextRequest("https://recomp.example.com/.well-known/oauth-protected-resource")
    );
    expect(prRes.status).toBe(200);
    const prJson = (await prRes.json()) as {
      resource: string;
      authorization_servers: string[];
      bearer_methods_supported: string[];
    };
    expect(prJson.resource).toBe("https://recomp.example.com/mcp");
    expect(prJson.authorization_servers).toEqual(["https://recomp.example.com"]);
    expect(prJson.bearer_methods_supported).toEqual(["header"]);

    const prMcpRes = await getProtectedResourceMcp(
      new NextRequest("https://recomp.example.com/.well-known/oauth-protected-resource/mcp")
    );
    expect(prMcpRes.status).toBe(200);

    const asRes = await getAuthServerMeta(
      new NextRequest("https://recomp.example.com/.well-known/oauth-authorization-server")
    );
    expect(asRes.status).toBe(200);
    const asJson = (await asRes.json()) as {
      issuer: string;
      registration_endpoint: string;
      client_id_metadata_document_supported: boolean;
      code_challenge_methods_supported: string[];
    };
    expect(asJson.issuer).toBe("https://recomp.example.com");
    expect(asJson.registration_endpoint).toBe("https://recomp.example.com/oauth/register");
    expect(asJson.client_id_metadata_document_supported).toBe(true);
    expect(asJson.code_challenge_methods_supported).toEqual(["S256"]);

    for (const optRes of [
      await optionsProtectedResource(),
      await optionsAuthServerMeta(),
      await mcpOptions(),
    ]) {
      expect(optRes.status).toBe(204);
      expect(optRes.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(optRes.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    }
  });

  it("rejects unauthenticated requests and query-param ?token= with 401 WWW-Authenticate", async () => {
    const noAuthRes = await mcpPost(
      new NextRequest("https://recomp.example.com/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      })
    );
    expect(noAuthRes.status).toBe(401);
    expect(noAuthRes.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="https://recomp.example.com/.well-known/oauth-protected-resource"'
    );

    const queryTokenRes = await mcpPost(
      new NextRequest(`https://recomp.example.com/mcp?token=${encodeURIComponent(patToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      })
    );
    expect(queryTokenRes.status).toBe(401);
  });

  it("handles Streamable HTTP initialize, tools/list, and `about` tool with SEP-973 serverInfo", async () => {
    const mcpHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${patToken}`,
    };

    const initRes = await mcpPost(
      new NextRequest("https://recomp.example.com/mcp", {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "vitest-mcp-client", version: "1.0.0" },
          },
        }),
      })
    );
    expect(initRes.status).toBe(200);
    expect(initRes.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const initPayload = await parseMcpResponse(initRes);
    const serverInfo = (initPayload.result as { serverInfo: Record<string, unknown> }).serverInfo;
    expect(serverInfo.name).toBe("recomp-pro");
    expect(serverInfo.title).toBe("Recomp Pro");
    expect(serverInfo.websiteUrl).toBe("https://recomp.example.com");
    expect(Array.isArray(serverInfo.icons)).toBe(true);

    const listRes = await mcpPost(
      new NextRequest("https://recomp.example.com/mcp", {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      })
    );
    expect(listRes.status).toBe(200);
    const listPayload = await parseMcpResponse(listRes);
    const tools = (listPayload.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((t) => t.name)).toContain("about");

    const callRes = await mcpPost(
      new NextRequest("https://recomp.example.com/mcp", {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "about", arguments: {} },
        }),
      })
    );
    expect(callRes.status).toBe(200);
    const callPayload = await parseMcpResponse(callRes);
    const contentText = (callPayload.result as { content: Array<{ text: string }> }).content[0].text;
    const aboutData = JSON.parse(contentText) as {
      name: string;
      auth: { method: string; readOnly: boolean };
    };
    expect(aboutData.name).toBe("recomp-pro");
    expect(aboutData.auth.method).toBe("pat");
    expect(aboutData.auth.readOnly).toBe(true);

    const getRes = await mcpGet(
      new NextRequest("https://recomp.example.com/mcp", {
        method: "GET",
        headers: { Authorization: `Bearer ${patToken}` },
      })
    );
    expect(getRes.status).toBe(405);
  });

  it("disables MCP and discovery endpoints when ENABLE_MCP_SERVER=false", async () => {
    process.env.ENABLE_MCP_SERVER = "false";

    const mcpRes = await mcpPost(
      new NextRequest("https://recomp.example.com/mcp", { method: "POST" })
    );
    expect(mcpRes.status).toBe(503);

    const discRes = await getProtectedResource(
      new NextRequest("https://recomp.example.com/.well-known/oauth-protected-resource")
    );
    expect(discRes.status).toBe(503);
  });

  it("serves 512x512 PNG brand icon on GET and HEAD /icon.png", async () => {
    const getRes = await iconGet();
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("Content-Type")).toBe("image/png");
    const bytes = new Uint8Array(await getRes.arrayBuffer());
    // PNG magic signature: 89 50 4E 47
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);

    const headRes = await iconHead();
    expect(headRes.status).toBe(200);
    expect(headRes.headers.get("Content-Type")).toBe("image/png");
  });
});
