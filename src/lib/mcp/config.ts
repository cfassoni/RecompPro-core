import fs from "fs";
import path from "path";

let cachedVersion: string | null = null;

/** Reads application version from VERSION file or package.json. */
export function getAppVersion(): string {
  if (cachedVersion) return cachedVersion;

  try {
    const versionFile = path.resolve(process.cwd(), "VERSION");
    if (fs.existsSync(versionFile)) {
      const content = fs.readFileSync(versionFile, "utf-8").trim();
      if (content) {
        cachedVersion = content;
        return content;
      }
    }
  } catch {
    // Fallback to package.json
  }

  try {
    const pkgFile = path.resolve(process.cwd(), "package.json");
    if (fs.existsSync(pkgFile)) {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf-8")) as { version?: string };
      if (pkg.version) {
        cachedVersion = pkg.version;
        return pkg.version;
      }
    }
  } catch {
    // Fallback below
  }

  cachedVersion = "0.0.0";
  return cachedVersion;
}

/**
 * Resolves the canonical public origin (scheme + host + optional port) for OAuth/MCP discovery.
 * Honors NEXT_PUBLIC_APP_URL when set to a non-localhost origin or when no proxy host header exists.
 */
export function getCanonicalOrigin(req?: Request): string {
  const envRaw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  let envOrigin: string | null = null;
  if (envRaw) {
    try {
      envOrigin = new URL(envRaw).origin;
    } catch {
      envOrigin = null;
    }
  }

  if (req) {
    const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    if (forwardedHost) {
      if (envOrigin && !isLocalhostOrigin(envOrigin)) {
        return envOrigin;
      }
      return `${forwardedProto}://${forwardedHost}`;
    }

    const hostHeader = req.headers.get("host")?.split(",")[0]?.trim();
    const rawForwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (hostHeader && rawForwardedProto) {
      if (envOrigin && !isLocalhostOrigin(envOrigin)) {
        return envOrigin;
      }
      return `${rawForwardedProto}://${hostHeader}`;
    }

    if (envOrigin && !isLocalhostOrigin(envOrigin)) {
      return envOrigin;
    }

    try {
      const reqOrigin = new URL(req.url).origin;
      if (reqOrigin && reqOrigin !== "null") {
        return reqOrigin;
      }
    } catch {
      // Fallback below
    }
  }

  return envOrigin || "http://localhost:3000";
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** Returns the canonical protected resource URL for the MCP endpoint. */
export function getMcpResourceUrl(req?: Request): string {
  return `${getCanonicalOrigin(req)}/mcp`;
}

export function getAccessTokenTtlSeconds(): number {
  const raw = Number(process.env.MCP_ACCESS_TOKEN_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3600;
}

export function getRefreshTokenTtlDays(): number {
  const raw = Number(process.env.MCP_REFRESH_TOKEN_TTL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 90;
}

export function getAuditLogMaxPerUser(): number {
  const raw = Number(process.env.MCP_AUDIT_LOG_MAX_PER_USER);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 500;
}

export function getAuditLogRetentionDays(): number {
  const raw = Number(process.env.MCP_AUDIT_LOG_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 90;
}
