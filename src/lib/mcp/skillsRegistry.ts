import crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError, type ServerResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpAuthContext } from "@/lib/mcp/auth";
import { hasScope } from "@/lib/mcp/scopes";

export interface SkillFileManifest {
  relativePath: string;
  mimeType: string;
  size: number;
  sha256: string;
}

export interface CanonicalSkill {
  slug: string;
  name: string;
  description: string;
  compatibility: string;
  requiredScopes: string[];
  dirPath: string;
  files: SkillFileManifest[];
}

export interface Sep2640SkillResource {
  uri: string;
  digest: string;
  size: number;
  mimeType: string;
}

export interface Sep2640SkillDto {
  uri: string;
  frontmatter: {
    name: string;
    description: string;
    compatibility: string;
  };
  resources: Sep2640SkillResource[];
}

export interface Sep2640DirectoryEntry {
  name: string;
  uri: string;
  type: "file" | "directory";
  size?: number;
  mimeType?: string;
}

const SKILLS_ROOT = path.resolve(process.cwd(), "src", "lib", "mcp", "skills");

function inferMimeType(relPath: string): string {
  const ext = path.extname(relPath).toLowerCase();
  if (ext === ".md") return "text/markdown";
  if (ext === ".json") return "application/json";
  if (ext === ".yaml" || ext === ".yml") return "application/yaml";
  return "text/plain";
}

function unquoteYamlString(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parses YAML frontmatter (`name`, `description`, `compatibility`, `required_scopes`) from a `SKILL.md` file.
 */
export function parseSkillFrontmatter(content: string): {
  name: string;
  description: string;
  compatibility: string;
  requiredScopes: string[];
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {
      name: "",
      description: "",
      compatibility: "Recomp Pro MCP Server (v1)",
      requiredScopes: [],
    };
  }

  const yamlLines = match[1].split(/\r?\n/);
  let name = "";
  let description = "";
  let compatibility = "Recomp Pro MCP Server (v1)";
  const requiredScopes: string[] = [];
  let inRequiredScopes = false;

  for (const line of yamlLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (inRequiredScopes) {
      if (trimmed.startsWith("- ")) {
        const scopeVal = unquoteYamlString(trimmed.slice(2));
        if (scopeVal) requiredScopes.push(scopeVal);
        continue;
      }
      if (!line.startsWith(" ") && !line.startsWith("\t")) {
        inRequiredScopes = false;
      }
    }

    const kvMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (!kvMatch) continue;
    const [, key, rawVal] = kvMatch;

    if (key === "name") {
      name = unquoteYamlString(rawVal);
    } else if (key === "description") {
      description = unquoteYamlString(rawVal);
    } else if (key === "compatibility") {
      compatibility = unquoteYamlString(rawVal) || compatibility;
    } else if (key === "required_scopes") {
      inRequiredScopes = true;
      if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        const items = rawVal
          .slice(1, -1)
          .split(",")
          .map((s) => unquoteYamlString(s))
          .filter(Boolean);
        requiredScopes.push(...items);
        inRequiredScopes = false;
      }
    }
  }

  return {
    name,
    description,
    compatibility,
    requiredScopes,
  };
}

function collectFilesRecursively(baseDir: string, currentDir: string): SkillFileManifest[] {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const results: SkillFileManifest[] = [];

  for (const entry of entries) {
    const absPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursively(baseDir, absPath));
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDir, absPath).replace(/\\/g, "/");
      const bytes = fs.readFileSync(absPath);
      results.push({
        relativePath,
        mimeType: inferMimeType(relativePath),
        size: bytes.byteLength,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }

  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Loads all canonical Agent Skills from `src/lib/mcp/skills/` in deterministic sorted order.
 */
export function loadCanonicalSkills(skillsRoot: string = SKILLS_ROOT): CanonicalSkill[] {
  if (!fs.existsSync(skillsRoot)) {
    return [];
  }

  const dirs = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));

  const skills: CanonicalSkill[] = [];
  for (const slug of dirs) {
    const dirPath = path.join(skillsRoot, slug);
    const skillMdPath = path.join(dirPath, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    const rawSkillMd = fs.readFileSync(skillMdPath, "utf-8");
    const meta = parseSkillFrontmatter(rawSkillMd);
    const files = collectFilesRecursively(dirPath, dirPath);

    skills.push({
      slug,
      name: meta.name || slug,
      description: meta.description,
      compatibility: meta.compatibility,
      requiredScopes: meta.requiredScopes,
      dirPath,
      files,
    });
  }

  return skills;
}

function isSkillAuthorized(skill: CanonicalSkill, grantedScopes: readonly string[]): boolean {
  return skill.requiredScopes.every((scope) => hasScope(grantedScopes, scope));
}

function toSkillDto(skill: CanonicalSkill): Sep2640SkillDto {
  return {
    uri: `skill://${skill.slug}/SKILL.md`,
    frontmatter: {
      name: skill.name,
      description: skill.description,
      compatibility: skill.compatibility,
    },
    resources: skill.files.map((f) => ({
      uri: `skill://${skill.slug}/${f.relativePath}`,
      digest: `sha256:${f.sha256}`,
      size: f.size,
      mimeType: f.mimeType,
    })),
  };
}

function parseSkillUri(uriOrSlug: string): { slug: string; subPath: string } {
  const trimmed = uriOrSlug.trim();
  const withoutScheme = trimmed.startsWith("skill://")
    ? trimmed.slice("skill://".length)
    : trimmed;
  const cleaned = withoutScheme.replace(/^\/+|\/+$/g, "");
  const slashIdx = cleaned.indexOf("/");
  if (slashIdx === -1) {
    return { slug: cleaned, subPath: "" };
  }
  return {
    slug: cleaned.slice(0, slashIdx),
    subPath: cleaned.slice(slashIdx + 1),
  };
}

function resolveSlug(uriOrSlug: string): string {
  return parseSkillUri(uriOrSlug).slug;
}

/** Lists all SEP-2640 skills visible to the caller's granted scopes. */
export function listAuthorizedSkills(
  grantedScopes: readonly string[],
  skillsRoot: string = SKILLS_ROOT
): Sep2640SkillDto[] {
  return loadCanonicalSkills(skillsRoot)
    .filter((skill) => isSkillAuthorized(skill, grantedScopes))
    .map(toSkillDto);
}

/** Retrieves a single SEP-2640 skill manifest after verifying existence and scope authorization. */
export function getAuthorizedSkill(
  uriOrSlug: string,
  grantedScopes: readonly string[],
  skillsRoot: string = SKILLS_ROOT
): Sep2640SkillDto {
  const slug = resolveSlug(uriOrSlug);
  const skill = loadCanonicalSkills(skillsRoot).find((s) => s.slug === slug);
  if (!skill) {
    throw new McpError(ErrorCode.InvalidParams, `Skill not found: ${uriOrSlug}`);
  }
  if (!isSkillAuthorized(skill, grantedScopes)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Insufficient scope to access skill: ${skill.slug}`
    );
  }
  return toSkillDto(skill);
}

/** Reads a single file inside a canonical skill directory with strict path-traversal and scope guards. */
export function readAuthorizedSkillFile(
  uriOrSlug: string,
  relPath: string,
  grantedScopes: readonly string[],
  skillsRoot: string = SKILLS_ROOT
): { uri: string; mimeType: string; text: string; sha256: string; size: number } {
  const slug = resolveSlug(uriOrSlug);
  const skill = loadCanonicalSkills(skillsRoot).find((s) => s.slug === slug);
  if (!skill) {
    throw new McpError(ErrorCode.InvalidParams, `Skill not found: ${slug}`);
  }
  if (!isSkillAuthorized(skill, grantedScopes)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Insufficient scope to access skill: ${skill.slug}`
    );
  }

  const cleanRel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleanRel || cleanRel.split("/").some((seg) => seg === ".." || seg === ".")) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid skill file path");
  }

  const resolvedSkillRoot = path.resolve(skill.dirPath);
  const resolvedTarget = path.resolve(resolvedSkillRoot, cleanRel);
  if (!resolvedTarget.startsWith(resolvedSkillRoot + path.sep)) {
    throw new McpError(ErrorCode.InvalidParams, "Skill file path escapes skill directory");
  }

  const manifest = skill.files.find((f) => f.relativePath === cleanRel);
  if (!manifest || !fs.existsSync(resolvedTarget)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Skill file not found: skill://${skill.slug}/${cleanRel}`
    );
  }

  const text = fs.readFileSync(resolvedTarget, "utf-8");
  return {
    uri: `skill://${skill.slug}/${cleanRel}`,
    mimeType: manifest.mimeType,
    text,
    sha256: manifest.sha256,
    size: manifest.size,
  };
}

/** Lists immediate directory entries inside a skill folder (`resources/directory/read`). */
export function readAuthorizedSkillDirectory(
  uriOrSlug: string,
  grantedScopes: readonly string[],
  skillsRoot: string = SKILLS_ROOT
): {
  entries: Sep2640DirectoryEntry[];
} {
  const { slug, subPath } = parseSkillUri(uriOrSlug);
  const skill = loadCanonicalSkills(skillsRoot).find((s) => s.slug === slug);
  if (!skill) {
    throw new McpError(ErrorCode.InvalidParams, `Skill not found: ${uriOrSlug}`);
  }
  if (!isSkillAuthorized(skill, grantedScopes)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Insufficient scope to access skill: ${skill.slug}`
    );
  }

  const cleanSubPath = subPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (
    cleanSubPath &&
    cleanSubPath.split("/").some((seg) => seg === ".." || seg === ".")
  ) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid skill directory path");
  }

  const resolvedSkillRoot = path.resolve(skill.dirPath);
  const resolvedTarget = cleanSubPath
    ? path.resolve(resolvedSkillRoot, cleanSubPath)
    : resolvedSkillRoot;

  if (
    resolvedTarget !== resolvedSkillRoot &&
    !resolvedTarget.startsWith(resolvedSkillRoot + path.sep)
  ) {
    throw new McpError(ErrorCode.InvalidParams, "Directory path escapes skill directory");
  }

  if (!fs.existsSync(resolvedTarget) || !fs.statSync(resolvedTarget).isDirectory()) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Skill directory not found: ${uriOrSlug}`
    );
  }

  const dirents = fs
    .readdirSync(resolvedTarget, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  const entries: Sep2640DirectoryEntry[] = [];
  for (const dirent of dirents) {
    const relPath = cleanSubPath ? `${cleanSubPath}/${dirent.name}` : dirent.name;
    const entryUri = `skill://${skill.slug}/${relPath}`;
    if (dirent.isDirectory()) {
      entries.push({
        name: dirent.name,
        uri: entryUri,
        type: "directory",
        mimeType: "inode/directory",
      });
    } else if (dirent.isFile()) {
      const stat = fs.statSync(path.join(resolvedTarget, dirent.name));
      entries.push({
        name: dirent.name,
        uri: entryUri,
        type: "file",
        size: stat.size,
        mimeType: inferMimeType(relPath),
      });
    }
  }

  return { entries };
}

const SkillsListRequestSchema = z.object({
  method: z.literal("skills/list"),
  params: z.object({ cursor: z.string().optional() }).optional(),
});

const SkillsGetRequestSchema = z.object({
  method: z.literal("skills/get"),
  params: z.object({
    uri: z.string().optional(),
    name: z.string().optional(),
  }),
});

const ResourcesDirectoryReadRequestSchema = z.object({
  method: z.literal("resources/directory/read"),
  params: z.object({
    uri: z.string(),
  }),
});

/**
 * Registers SEP-2640 (`io.modelcontextprotocol/skills`) JSON-RPC handlers and `skill://` resource template.
 */
export function registerSep2640OnMcpServer(server: McpServer, auth: McpAuthContext): void {
  server.registerResource(
    "mcp_skill_file",
    new ResourceTemplate("skill://{slug}/{+path}", { list: undefined }),
    {
      title: "Agent Skill File",
      description: "Canonical Agent Skill playbook and reference files (SEP-2640).",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const slug = String(variables.slug || "");
      const rawPath = Array.isArray(variables.path)
        ? variables.path.join("/")
        : String(variables.path || "");
      const file = readAuthorizedSkillFile(slug, rawPath, auth.scopes);
      return {
        contents: [
          {
            uri: uri.href || file.uri,
            mimeType: file.mimeType,
            text: file.text,
          },
        ],
      };
    }
  );

  server.server.setRequestHandler(SkillsListRequestSchema, async () => {
    const skills = listAuthorizedSkills(auth.scopes);
    return { skills } as unknown as ServerResult;
  });

  server.server.setRequestHandler(SkillsGetRequestSchema, async (request) => {
    const target = request.params.uri || request.params.name;
    if (!target) {
      throw new McpError(ErrorCode.InvalidParams, "Either uri or name is required");
    }
    const skill = getAuthorizedSkill(target, auth.scopes);
    return skill as unknown as ServerResult;
  });

  server.server.setRequestHandler(ResourcesDirectoryReadRequestSchema, async (request) => {
    const result = readAuthorizedSkillDirectory(request.params.uri, auth.scopes);
    return result as unknown as ServerResult;
  });
}
