export const SUPPORTED_SCOPES = [
  "recomp:read",
  "recomp:write",
  "profile:read",
  "profile:write",
  "biometrics:read",
  "biometrics:write",
  "workouts:read",
  "workouts:write",
  "integrations:read",
  "integrations:write",
  "shared_links:read",
  "shared_links:write",
  "nutrition:read",
  "nutrition:write",
] as const;

export type McpScope = (typeof SUPPORTED_SCOPES)[number];

const SUPPORTED_SCOPE_SET = new Set<string>(SUPPORTED_SCOPES);

/** Parses and validates a space-delimited scope string, defaulting to `recomp:read` when empty. */
export function validateRequestedScopes(
  raw?: string | null
): { ok: true; scopes: string[] } | { ok: false; unknown: string[] } {
  if (!raw || !raw.trim()) {
    return { ok: true, scopes: ["recomp:read"] };
  }

  const parts = Array.from(new Set(raw.trim().split(/\s+/).filter(Boolean)));
  const unknown = parts.filter((s) => !SUPPORTED_SCOPE_SET.has(s));
  if (unknown.length > 0) {
    return { ok: false, unknown };
  }
  return { ok: true, scopes: parts };
}

/** Parses a space-delimited scope string into known scopes (falling back to `recomp:read`). */
export function parseRequestedScopes(raw?: string | null): string[] {
  const res = validateRequestedScopes(raw);
  if (res.ok) return res.scopes;
  const known = (raw || "")
    .trim()
    .split(/\s+/)
    .filter((s) => SUPPORTED_SCOPE_SET.has(s));
  return known.length > 0 ? Array.from(new Set(known)) : ["recomp:read"];
}

/** Strips all `:write` scopes for Read-Only consent or PAT downgrade. */
export function stripWriteScopes(scopes: string[]): string[] {
  const readOnly = Array.from(
    new Set(scopes.filter((s) => !s.endsWith(":write") && SUPPORTED_SCOPE_SET.has(s)))
  );
  return readOnly.length > 0 ? readOnly : ["recomp:read"];
}

/**
 * Resolves hybrid hierarchical scopes:
 * A tool requiring `<domain>:<op>` is allowed iff granted scopes contain `<domain>:<op>` or `recomp:<op>`.
 */
export function hasScope(grantedScopes: readonly string[], requiredScope: string): boolean {
  if (grantedScopes.includes(requiredScope)) {
    return true;
  }
  const [, op] = requiredScope.split(":");
  if (op === "read" || op === "write") {
    return grantedScopes.includes(`recomp:${op}`);
  }
  return false;
}

/** Returns true when no write scopes are present. */
export function isReadOnlyScopes(scopes: readonly string[]): boolean {
  return !scopes.some((s) => s.endsWith(":write"));
}
