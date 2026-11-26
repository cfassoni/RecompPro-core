import fs from "fs";
import path from "path";
import { getAppVersion } from "@/lib/mcp/config";
import { loadCanonicalSkills } from "@/lib/mcp/skillsRegistry";
import { createZipBuffer, type ZipInputEntry } from "@/lib/mcp/zip";

export type BundleTarget = "antigravity" | "claude" | "chatgpt";

const VALID_TARGETS = new Set<BundleTarget>(["antigravity", "claude", "chatgpt"]);

const REPO_URL = "https://github.com/cfassoni/RecompPro-core";
const PLUGIN_DESCRIPTION =
  "Connects AI assistants to your self-hosted Recomp Pro body composition, strength training volume, muscle readiness, and shared report telemetry.";

const DOMAIN_RULES_MD = `# Recomp Pro Domain Guardrails

- Always report authoritative measurements and units exactly as returned by Recomp Pro MCP tools (\`kg\`, \`%\`, \`kcal\`, \`kg/m²\`).
- Keep \`muscle_mass\` (total muscle mass) distinct from \`skeletal_muscle_mass\` (skeletal muscle mass) and \`skeletal_muscle_mass_pct\`.
- Never fabricate missing bioimpedance scans, clinical diagnoses, or synthetic PR records.
- Always request explicit user confirmation before invoking destructive write tools (\`delete_biometric_records\`, \`delete_shared_link\`).
`;

export function parseBundleTarget(raw: string): BundleTarget | null {
  const normalized = raw.trim().toLowerCase().replace(/\.zip$/, "");
  return VALID_TARGETS.has(normalized as BundleTarget)
    ? (normalized as BundleTarget)
    : null;
}

function loadSkillEntries(prefix: string): ZipInputEntry[] {
  const skills = loadCanonicalSkills();
  const entries: ZipInputEntry[] = [];

  for (const skill of skills) {
    for (const f of skill.files) {
      const absPath = path.join(skill.dirPath, f.relativePath);
      const data = fs.readFileSync(absPath);
      entries.push({
        name: `${prefix}${skill.slug}/${f.relativePath}`,
        data,
      });
    }
  }

  return entries;
}

function loadBrandLogo(): Buffer {
  const iconPath = path.resolve(process.cwd(), "public", "mcp-icon.png");
  return fs.readFileSync(iconPath);
}

/**
 * Generates a personalized `.zip` plugin bundle for Antigravity, Claude, or ChatGPT/Codex.
 * Dynamically injects `<origin>/mcp` without embedding any credentials or tokens.
 */
export function buildMcpPluginBundle(
  target: BundleTarget,
  origin: string
): { filename: string; buffer: Buffer } {
  const version = getAppVersion();
  const cleanOrigin = origin.replace(/\/+$/, "");
  const mcpUrl = `${cleanOrigin}/mcp`;

  if (target === "antigravity") {
    const manifest = {
      name: "recomp-pro",
      displayName: "Recomp Pro",
      description: PLUGIN_DESCRIPTION,
      version,
      logo: "assets/logo.png",
      suggestedPrompts: [
        "Review my body recomposition progress over the last 3 months",
        "Check my muscle group recovery and plan today's workout",
        "Interpret my latest bioimpedance scan and segmental balance",
        "Curate my starred scans into a shared report link for my coach",
      ],
      author: {
        name: "Recomp Pro",
        url: REPO_URL,
      },
      homepage: cleanOrigin,
      repository: REPO_URL,
    };

    const mcpConfig = {
      mcpServers: {
        "recomp-pro": {
          url: mcpUrl,
        },
      },
    };

    const entries: ZipInputEntry[] = [
      {
        name: "recomp-pro/plugin.json",
        data: JSON.stringify(manifest, null, 2) + "\n",
      },
      {
        name: "recomp-pro/mcp_config.json",
        data: JSON.stringify(mcpConfig, null, 2) + "\n",
      },
      {
        name: "recomp-pro/assets/logo.png",
        data: loadBrandLogo(),
      },
      {
        name: "recomp-pro/rules/AGENTS.md",
        data: DOMAIN_RULES_MD,
      },
      ...loadSkillEntries("recomp-pro/skills/"),
    ];

    return {
      filename: "recomp-pro-antigravity.zip",
      buffer: createZipBuffer(entries),
    };
  }

  if (target === "claude") {
    const manifest = {
      name: "recomp-pro",
      version,
      description: PLUGIN_DESCRIPTION,
      author: {
        name: "Recomp Pro",
      },
      homepage: cleanOrigin,
      repository: REPO_URL,
    };

    const mcpConfig = {
      mcpServers: {
        "recomp-pro": {
          type: "http",
          url: mcpUrl,
        },
      },
    };

    const entries: ZipInputEntry[] = [
      {
        name: "recomp-pro/.claude-plugin/plugin.json",
        data: JSON.stringify(manifest, null, 2) + "\n",
      },
      {
        name: "recomp-pro/.mcp.json",
        data: JSON.stringify(mcpConfig, null, 2) + "\n",
      },
      ...loadSkillEntries("recomp-pro/skills/"),
    ];

    return {
      filename: "recomp-pro-claude.zip",
      buffer: createZipBuffer(entries),
    };
  }

  // target === "chatgpt" (Agent Plugins 1.0 at zip root)
  const chatgptManifest = {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "recomp-pro",
    version,
    description: PLUGIN_DESCRIPTION,
  };

  const chatgptMcp = {
    mcpServers: {
      "recomp-pro": {
        type: "http",
        url: mcpUrl,
      },
    },
  };

  const entries: ZipInputEntry[] = [
    {
      name: "plugin.json",
      data: JSON.stringify(chatgptManifest, null, 2) + "\n",
    },
    {
      name: "mcp.json",
      data: JSON.stringify(chatgptMcp, null, 2) + "\n",
    },
    ...loadSkillEntries("skills/"),
  ];

  return {
    filename: "recomp-pro-chatgpt.zip",
    buffer: createZipBuffer(entries),
  };
}
