import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SKILLS_SRC_DIR = path.join(ROOT, "src", "lib", "mcp", "skills");
const PLUGIN_OUT_DIR = path.join(ROOT, "plugins", "recomp-pro");
const CLAUDE_MARKETPLACE_PATH = path.join(ROOT, ".claude-plugin", "marketplace.json");
const AGENTS_MARKETPLACE_PATH = path.join(ROOT, ".agents", "plugins", "marketplace.json");

const REPO_URL = "https://github.com/cfassoni/RecompPro-core";
const DESCRIPTION =
  "Connects AI assistants to your self-hosted Recomp Pro body composition, strength training volume, muscle readiness, and shared report telemetry.";

function readVersion() {
  const versionFile = path.join(ROOT, "VERSION");
  if (fs.existsSync(versionFile)) {
    const v = fs.readFileSync(versionFile, "utf-8").trim();
    if (v) return v;
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  return pkg.version || "0.0.0";
}

function walkFiles(baseDir, currentDir = baseDir) {
  if (!fs.existsSync(currentDir)) return [];
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(baseDir, abs));
    } else if (entry.isFile()) {
      files.push(path.relative(baseDir, abs).replace(/\\/g, "/"));
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function buildExpectedFileMap(version) {
  const files = new Map();
  const mcpUrlTemplate = "${RECOMP_PRO_URL}/mcp";

  files.set(
    path.join(PLUGIN_OUT_DIR, ".claude-plugin", "plugin.json"),
    Buffer.from(
      JSON.stringify(
        {
          name: "recomp-pro",
          version,
          description: DESCRIPTION,
          author: { name: "Recomp Pro" },
          homepage: REPO_URL,
          repository: REPO_URL,
        },
        null,
        2
      ) + "\n",
      "utf-8"
    )
  );

  files.set(
    path.join(PLUGIN_OUT_DIR, ".mcp.json"),
    Buffer.from(
      JSON.stringify(
        {
          mcpServers: {
            "recomp-pro": {
              type: "http",
              url: mcpUrlTemplate,
            },
          },
        },
        null,
        2
      ) + "\n",
      "utf-8"
    )
  );

  files.set(
    path.join(PLUGIN_OUT_DIR, "plugin.json"),
    Buffer.from(
      JSON.stringify(
        {
          $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
          name: "recomp-pro",
          version,
          description: DESCRIPTION,
        },
        null,
        2
      ) + "\n",
      "utf-8"
    )
  );

  files.set(
    path.join(PLUGIN_OUT_DIR, "mcp.json"),
    Buffer.from(
      JSON.stringify(
        {
          mcpServers: {
            "recomp-pro": {
              type: "http",
              url: mcpUrlTemplate,
            },
          },
        },
        null,
        2
      ) + "\n",
      "utf-8"
    )
  );

  files.set(
    CLAUDE_MARKETPLACE_PATH,
    Buffer.from(
      JSON.stringify(
        {
          name: "recomppro-core",
          owner: {
            name: "Recomp Pro",
            url: REPO_URL,
          },
          metadata: {
            description: "Official Recomp Pro Agent Skills & MCP Server marketplace",
            version,
          },
          plugins: [
            {
              name: "recomp-pro",
              source: "./plugins/recomp-pro",
              description: DESCRIPTION,
              version,
            },
          ],
        },
        null,
        2
      ) + "\n",
      "utf-8"
    )
  );

  files.set(
    AGENTS_MARKETPLACE_PATH,
    Buffer.from(
      JSON.stringify(
        {
          $schema: "https://agent-plugins.org/schemas/1.0.0/marketplace.schema.json",
          name: "recomppro-core",
          version,
          plugins: [
            {
              name: "recomp-pro",
              source: {
                source: "local",
                path: "./plugins/recomp-pro",
              },
              description: DESCRIPTION,
              version,
            },
          ],
        },
        null,
        2
      ) + "\n",
      "utf-8"
    )
  );

  const skillFiles = walkFiles(SKILLS_SRC_DIR);
  for (const rel of skillFiles) {
    const srcAbs = path.join(SKILLS_SRC_DIR, rel);
    const dstAbs = path.join(PLUGIN_OUT_DIR, "skills", rel);
    files.set(dstAbs, fs.readFileSync(srcAbs));
  }

  return { files, skillFiles };
}

function normalizeTextBuffer(buf) {
  return Buffer.from(buf.toString("utf-8").replace(/\r\n/g, "\n"), "utf-8");
}

function main() {
  const isCheck = process.argv.includes("--check");
  const version = readVersion();
  const { files, skillFiles } = buildExpectedFileMap(version);

  if (isCheck) {
    const errors = [];
    for (const [targetPath, expectedBuf] of files.entries()) {
      if (!fs.existsSync(targetPath)) {
        errors.push(`Missing file: ${path.relative(ROOT, targetPath)}`);
        continue;
      }
      const actualBuf = fs.readFileSync(targetPath);
      if (!normalizeTextBuffer(actualBuf).equals(normalizeTextBuffer(expectedBuf))) {
        errors.push(`Out-of-sync file: ${path.relative(ROOT, targetPath)}`);
      }
    }

    const outSkillFiles = walkFiles(path.join(PLUGIN_OUT_DIR, "skills"));
    for (const rel of outSkillFiles) {
      if (!skillFiles.includes(rel)) {
        errors.push(`Stale extra skill file: plugins/recomp-pro/skills/${rel}`);
      }
    }

    if (errors.length > 0) {
      console.error("MCP plugin marketplace drift detected:\n" + errors.join("\n"));
      process.exit(1);
    }
    console.log(`MCP plugins and marketplaces verified cleanly (v${version}, ${skillFiles.length} skill files).`);
    return;
  }

  const outSkillsDir = path.join(PLUGIN_OUT_DIR, "skills");
  if (fs.existsSync(outSkillsDir)) {
    fs.rmSync(outSkillsDir, { recursive: true, force: true });
  }

  for (const [targetPath, buf] of files.entries()) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, buf);
  }

  console.log(`Generated MCP plugin & marketplace artifacts (v${version}, ${files.size} files).`);
}

main();
