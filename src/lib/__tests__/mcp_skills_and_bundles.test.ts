import crypto from "crypto";
import fs from "fs";
import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ensureTablesExist } from "@/db/initDb";
import { createAccessToken, hashPassword } from "@/lib/auth";
import { createPersonalAccessToken } from "@/lib/mcp/oauth/tokens";
import { readAuthorizedSkillFile } from "@/lib/mcp/skillsRegistry";
import { readZipEntries } from "@/lib/mcp/zip";
import { POST as mcpPost } from "@/app/mcp/route";
import { GET as bundleGet } from "@/app/api/mcp/bundles/[target]/route";

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

async function rpc(
  token: string,
  id: number,
  method: string,
  params: Record<string, unknown> = {}
) {
  const res = await mcpPost(
    new NextRequest("https://recomp.example.com/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
    })
  );
  const payload = await parseMcpResponse(res);
  return { status: res.status, payload };
}

describe("MCP Phase 5: SEP-2640 Skills Extension, Dynamic .zip Bundles & Git Marketplaces", () => {
  const originalEnableFlag = process.env.ENABLE_MCP_SERVER;

  let readOnlyPat = "";
  let readWritePat = "";
  let userJwt = "";

  beforeAll(async () => {
    await ensureTablesExist();
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const hashedPassword = await hashPassword("StrongPass123!");

    const [u] = await db
      .insert(users)
      .values({
        email: `mcp_p5_${suffix}@example.com`,
        hashedPassword,
        displayName: "Phase 5 Tester",
        emailConfirmed: true,
        preferredLanguage: "en",
      })
      .returning();

    userJwt = await createAccessToken({ sub: u.email, userId: u.id, email: u.email });
    readOnlyPat = (
      await createPersonalAccessToken({
        userId: u.id,
        name: "Phase 5 RO",
        scopes: ["recomp:read"],
      })
    ).token;
    readWritePat = (
      await createPersonalAccessToken({
        userId: u.id,
        name: "Phase 5 RW",
        scopes: ["recomp:read", "recomp:write"],
      })
    ).token;
  });

  afterEach(() => {
    if (originalEnableFlag === undefined) {
      delete process.env.ENABLE_MCP_SERVER;
    } else {
      process.env.ENABLE_MCP_SERVER = originalEnableFlag;
    }
  });

  it("declares SEP-2640 capability and serves scope-filtered skills/list, skills/get, and skill:// reads", async () => {
    // 1. Initialize declares io.modelcontextprotocol/skills
    const initRes = await rpc(readWritePat, 1, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "sep-2640-client", version: "1.0.0" },
    });
    expect(initRes.status).toBe(200);
    const caps = (
      initRes.payload.result as {
        capabilities: {
          extensions?: Record<string, { directoryRead?: boolean }>;
        };
      }
    ).capabilities;
    expect(caps.extensions?.["io.modelcontextprotocol/skills"]).toEqual({
      directoryRead: true,
    });

    // 2. Read-Only token filters out write-scoped skill (`shared-report-curator`)
    const roListRes = await rpc(readOnlyPat, 2, "skills/list", {});
    expect(roListRes.status).toBe(200);
    const roSkills = (
      roListRes.payload.result as { skills: Array<{ name: string; uri: string }> }
    ).skills;
    expect(roSkills.map((s) => s.name).sort()).toEqual([
      "biometrics-interpreter",
      "recomp-progress-analysis",
      "training-readiness-coach",
    ]);

    // Read-Only token rejected on skills/get & resources/read for write skill
    const roGetDenied = await rpc(readOnlyPat, 3, "skills/get", {
      uri: "skill://shared-report-curator",
    });
    expect(roGetDenied.payload.error).toBeDefined();

    const roFileDenied = await rpc(readOnlyPat, 4, "resources/read", {
      uri: "skill://shared-report-curator/SKILL.md",
    });
    expect(roFileDenied.payload.error).toBeDefined();

    // 3. Read+Write token sees all 4 skills with valid SHA-256 digests
    const rwListRes = await rpc(readWritePat, 5, "skills/list", {});
    const rwSkills = (
      rwListRes.payload.result as {
        skills: Array<{
          name: string;
          uri: string;
          files: Array<{ path: string; uri: string; sha256: string; size: number }>;
        }>;
      }
    ).skills;
    expect(rwSkills.map((s) => s.name).sort()).toEqual([
      "biometrics-interpreter",
      "recomp-progress-analysis",
      "shared-report-curator",
      "training-readiness-coach",
    ]);

    const curator = rwSkills.find((s) => s.name === "shared-report-curator")!;
    expect(curator.uri).toBe("skill://shared-report-curator");
    const skillMdEntry = curator.files.find((f) => f.path === "SKILL.md")!;
    expect(skillMdEntry.sha256).toMatch(/^[a-f0-9]{64}$/);

    // 4. skills/get, resources/read, and resources/directory/read match disk SHA-256
    const getRes = await rpc(readWritePat, 6, "skills/get", {
      uri: "skill://biometrics-interpreter",
    });
    const bioSkill = (getRes.payload.result as { skill: { name: string; files: Array<{ sha256: string }> } }).skill;
    expect(bioSkill.name).toBe("biometrics-interpreter");

    const fileReadRes = await rpc(readWritePat, 7, "resources/read", {
      uri: "skill://biometrics-interpreter/SKILL.md",
    });
    const fileContent = (
      fileReadRes.payload.result as { contents: Array<{ text: string; mimeType: string }> }
    ).contents[0];
    expect(fileContent.mimeType).toBe("text/markdown");
    const computedSha = crypto
      .createHash("sha256")
      .update(Buffer.from(fileContent.text, "utf-8"))
      .digest("hex");
    expect(computedSha).toBe(bioSkill.files[0].sha256);

    const dirReadRes = await rpc(readWritePat, 8, "resources/directory/read", {
      uri: "skill://training-readiness-coach",
    });
    const dirResult = dirReadRes.payload.result as {
      uri: string;
      contents: Array<{ uri: string; text: string; sha256: string }>;
    };
    expect(dirResult.uri).toBe("skill://training-readiness-coach");
    expect(dirResult.contents.some((c) => c.uri === "skill://training-readiness-coach/SKILL.md")).toBe(true);

    // 5. Path traversal guard
    expect(() =>
      readAuthorizedSkillFile(
        "biometrics-interpreter",
        "../shared-report-curator/SKILL.md",
        ["recomp:read", "recomp:write"]
      )
    ).toThrow();
  });

  it("generates dynamic secret-free .zip bundles for antigravity, claude, and chatgpt", async () => {
    // 1. Antigravity bundle
    const agRes = await bundleGet(
      new NextRequest("https://recomp.example.com/api/mcp/bundles/antigravity.zip", {
        headers: { Authorization: `Bearer ${userJwt}` },
      }),
      { params: Promise.resolve({ target: "antigravity.zip" }) }
    );
    expect(agRes.status).toBe(200);
    expect(agRes.headers.get("Content-Type")).toBe("application/zip");
    const agEntries = readZipEntries(Buffer.from(await agRes.arrayBuffer()));

    const agPlugin = JSON.parse(agEntries.get("recomp-pro/plugin.json")!.toString("utf-8")) as Record<string, unknown>;
    expect(agPlugin.name).toBe("recomp-pro");
    expect(agPlugin.displayName).toBe("Recomp Pro");
    expect(agPlugin.logo).toBe("assets/logo.png");
    expect(agPlugin.homepage).toBe("https://recomp.example.com");

    const agMcp = JSON.parse(agEntries.get("recomp-pro/mcp_config.json")!.toString("utf-8")) as {
      mcpServers: { "recomp-pro": { url: string } };
    };
    expect(agMcp.mcpServers["recomp-pro"].url).toBe("https://recomp.example.com/mcp");
    expect(Array.from(agEntries.get("recomp-pro/assets/logo.png")!.subarray(0, 4))).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    expect(agEntries.has("recomp-pro/rules/AGENTS.md")).toBe(true);
    expect(agEntries.has("recomp-pro/skills/recomp-progress-analysis/SKILL.md")).toBe(true);
    expect(agEntries.has("recomp-pro/skills/shared-report-curator/SKILL.md")).toBe(true);

    // 2. Claude bundle
    const claudeRes = await bundleGet(
      new NextRequest("https://recomp.example.com/api/mcp/bundles/claude.zip", {
        headers: { Authorization: `Bearer ${userJwt}` },
      }),
      { params: Promise.resolve({ target: "claude.zip" }) }
    );
    expect(claudeRes.status).toBe(200);
    const claudeEntries = readZipEntries(Buffer.from(await claudeRes.arrayBuffer()));
    expect(claudeEntries.has("recomp-pro/.claude-plugin/plugin.json")).toBe(true);
    const claudeMcp = JSON.parse(claudeEntries.get("recomp-pro/.mcp.json")!.toString("utf-8")) as {
      mcpServers: { "recomp-pro": { type: string; url: string } };
    };
    expect(claudeMcp.mcpServers["recomp-pro"]).toEqual({
      type: "http",
      url: "https://recomp.example.com/mcp",
    });
    expect(claudeEntries.has("recomp-pro/skills/biometrics-interpreter/SKILL.md")).toBe(true);

    // 3. ChatGPT / Codex bundle (Agent Plugins 1.0 at root)
    const gptRes = await bundleGet(
      new NextRequest("https://recomp.example.com/api/mcp/bundles/chatgpt.zip", {
        headers: { Authorization: `Bearer ${userJwt}` },
      }),
      { params: Promise.resolve({ target: "chatgpt.zip" }) }
    );
    expect(gptRes.status).toBe(200);
    const gptEntries = readZipEntries(Buffer.from(await gptRes.arrayBuffer()));
    const gptManifest = JSON.parse(gptEntries.get("plugin.json")!.toString("utf-8")) as Record<string, unknown>;
    expect(gptManifest.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    const gptMcp = JSON.parse(gptEntries.get("mcp.json")!.toString("utf-8")) as {
      mcpServers: { "recomp-pro": { type: string; url: string } };
    };
    expect(gptMcp.mcpServers["recomp-pro"].url).toBe("https://recomp.example.com/mcp");
    expect(gptEntries.has("skills/training-readiness-coach/SKILL.md")).toBe(true);

    // Zero embedded secrets across all 3 archives
    for (const map of [agEntries, claudeEntries, gptEntries]) {
      for (const [name, buf] of map.entries()) {
        if (name.endsWith(".png")) continue;
        const text = buf.toString("utf-8");
        expect(text).not.toContain("recomp_pat_");
        expect(text).not.toContain("recomp_at_");
        expect(text).not.toContain("Bearer ");
      }
    }

    // Invalid target -> 400, disabled flag -> 503
    const badTarget = await bundleGet(
      new NextRequest("https://recomp.example.com/api/mcp/bundles/unknown.zip", {
        headers: { Authorization: `Bearer ${userJwt}` },
      }),
      { params: Promise.resolve({ target: "unknown.zip" }) }
    );
    expect(badTarget.status).toBe(400);

    process.env.ENABLE_MCP_SERVER = "false";
    const disabledRes = await bundleGet(
      new NextRequest("https://recomp.example.com/api/mcp/bundles/claude.zip", {
        headers: { Authorization: `Bearer ${userJwt}` },
      }),
      { params: Promise.resolve({ target: "claude.zip" }) }
    );
    expect(disabledRes.status).toBe(503);
  });

  it("keeps Git marketplace catalogs and plugins/recomp-pro synced with canonical skills", () => {
    const root = process.cwd();
    const claudeMkt = JSON.parse(
      fs.readFileSync(path.join(root, ".claude-plugin", "marketplace.json"), "utf-8")
    ) as { name: string; plugins: Array<{ name: string; source: string }> };
    expect(claudeMkt.name).toBe("recomppro-core");
    expect(claudeMkt.plugins[0].name).toBe("recomp-pro");
    expect(claudeMkt.plugins[0].source).toBe("./plugins/recomp-pro");

    const agentsMkt = JSON.parse(
      fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf-8")
    ) as { $schema: string; plugins: Array<{ name: string; source: { path: string } }> };
    expect(agentsMkt.$schema).toContain("marketplace.schema.json");
    expect(agentsMkt.plugins[0].source.path).toBe("./plugins/recomp-pro");

    const templateMcp = fs.readFileSync(
      path.join(root, "plugins", "recomp-pro", ".mcp.json"),
      "utf-8"
    );
    expect(templateMcp).toContain("${RECOMP_PRO_URL}/mcp");
  });
});
