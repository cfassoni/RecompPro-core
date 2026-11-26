import dns from "dns/promises";
import net from "net";
import { db } from "@/db/client";
import { mcpOauthClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateRedirectUri } from "./dcr";

export type OAuthTokenEndpointAuthMethod = "none" | "private_key_jwt";

export interface JwksDocument {
  keys: Record<string, unknown>[];
}

export interface CimdClientMetadata {
  client_id: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
  token_endpoint_auth_methods_supported?: string[];
  jwks_uri?: string;
  jwks?: { keys?: Record<string, unknown>[] };
}

export interface ResolvedOAuthClient {
  clientId: string;
  registrationType: "cimd" | "dcr";
  clientName: string;
  clientUri: string | null;
  logoUri: string | null;
  redirectUris: string[];
  tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod;
  allowedAuthMethods: OAuthTokenEndpointAuthMethod[];
  jwksUri: string | null;
  jwks: JwksDocument | null;
}

export interface CimdDependencies {
  lookup?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  fetchFn?: typeof fetch;
  now?: () => number;
}

const CIMD_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const JWKS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CIMD_MAX_BYTES = 64 * 1024; // 64 KiB
const CIMD_TIMEOUT_MS = 3000;

interface CachedCimdEntry {
  client: ResolvedOAuthClient;
  expiresAt: number;
}

interface CachedJwksEntry {
  jwks: JwksDocument;
  expiresAt: number;
}

const cimdMemoryCache = new Map<string, CachedCimdEntry>();
const jwksMemoryCache = new Map<string, CachedJwksEntry>();

export function clearCimdCache(): void {
  cimdMemoryCache.clear();
  jwksMemoryCache.clear();
}

export function isCimdClientId(clientId: string): boolean {
  if (!clientId.startsWith("https://")) return false;
  try {
    const parsed = new URL(clientId);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash;
  } catch {
    return false;
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    num = (num << 8) | octet;
  }
  return num >>> 0;
}

function inCidrV4(ipInt: number, base: string, maskBits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function isBlockedIpv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return true;
  return (
    inCidrV4(ipInt, "0.0.0.0", 8) || // Current network
    inCidrV4(ipInt, "10.0.0.0", 8) || // RFC 1918
    inCidrV4(ipInt, "100.64.0.0", 10) || // CGNAT
    inCidrV4(ipInt, "127.0.0.0", 8) || // Loopback
    inCidrV4(ipInt, "169.254.0.0", 16) || // Link-local / Cloud metadata
    inCidrV4(ipInt, "172.16.0.0", 12) || // RFC 1918
    inCidrV4(ipInt, "192.0.0.0", 24) || // IETF protocol assignments
    inCidrV4(ipInt, "192.0.2.0", 24) || // TEST-NET-1
    inCidrV4(ipInt, "192.168.0.0", 16) || // RFC 1918
    inCidrV4(ipInt, "198.18.0.0", 15) || // Benchmarking
    inCidrV4(ipInt, "198.51.100.0", 24) || // TEST-NET-2
    inCidrV4(ipInt, "203.0.113.0", 24) || // TEST-NET-3
    inCidrV4(ipInt, "224.0.0.0", 4) || // Multicast
    inCidrV4(ipInt, "240.0.0.0", 4) // Reserved
  );
}

function expandIpv6Hextets(ip: string): number[] | null {
  const zoneIdx = ip.indexOf("%");
  const clean = zoneIdx >= 0 ? ip.slice(0, zoneIdx) : ip;
  const halves = clean.split("::");
  if (halves.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const tokens = side.split(":");
    const out: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.includes(".")) {
        if (i !== tokens.length - 1) return null;
        const v4 = ipv4ToInt(tok);
        if (v4 === null) return null;
        out.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(tok)) return null;
        out.push(parseInt(tok, 16));
      }
    }
    return out;
  };

  const left = parseSide(halves[0]);
  if (!left) return null;
  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }
  const right = parseSide(halves[1]);
  if (!right) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;
  return [...left, ...Array<number>(missing).fill(0), ...right];
}

/** Returns true for loopback, private, link-local, metadata, multicast, or unspecified IPs. */
export function isBlockedIp(rawIp: string): boolean {
  const ip = rawIp.trim().replace(/^\[|\]$/g, "");
  const version = net.isIP(ip);
  if (version === 4) {
    return isBlockedIpv4(ip);
  }
  if (version === 6) {
    const hextets = expandIpv6Hextets(ip);
    if (!hextets) return true;

    const isAllZero = hextets.every((h) => h === 0);
    const isLoopback = hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1;
    if (isAllZero || isLoopback) return true;

    // IPv4-mapped IPv6 (::ffff:0:0/96)
    const isV4Mapped =
      hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff;
    if (isV4Mapped) {
      const v4 = `${(hextets[6] >>> 8) & 0xff}.${hextets[6] & 0xff}.${(hextets[7] >>> 8) & 0xff}.${hextets[7] & 0xff}`;
      return isBlockedIpv4(v4);
    }

    // ULA fc00::/7
    if ((hextets[0] & 0xfe00) === 0xfc00) return true;
    // Link-local fe80::/10
    if ((hextets[0] & 0xffc0) === 0xfe80) return true;
    // Multicast ff00::/8
    if ((hextets[0] & 0xff00) === 0xff00) return true;

    return false;
  }
  return true;
}

/** Returns true if hostname is local, internal, or a blocked IP literal. */
export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }
  if (net.isIP(lower.replace(/^\[|\]$/g, "")) !== 0) {
    return isBlockedIp(lower);
  }
  return false;
}

/** Validates an inline JWK Set object `{ keys: [...] }` and returns a normalized copy or null. */
export function normalizeInlineJwks(raw: unknown): JwksDocument | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as { keys?: unknown };
  if (!Array.isArray(obj.keys) || obj.keys.length === 0) {
    return null;
  }
  const validKeys = obj.keys.filter(
    (k): k is Record<string, unknown> => Boolean(k) && typeof k === "object" && !Array.isArray(k)
  );
  return validKeys.length > 0 ? { keys: validKeys } : null;
}

/** Validates an HTTPS `jwks_uri` string and rejects blocked SSRF hostnames. */
export function validateHttpsJwksUri(raw: unknown): { ok: true; uri: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "jwks_uri must be a non-empty HTTPS URL" };
  }
  if (!isCimdClientId(raw)) {
    return { ok: false, error: "Invalid jwks_uri: must be an HTTPS URL without credentials or fragments" };
  }
  const parsed = new URL(raw);
  if (isBlockedHostname(parsed.hostname)) {
    return { ok: false, error: "jwks_uri host is blocked by SSRF protection" };
  }
  return { ok: true, uri: raw };
}

/** Resolves primary and allowed token endpoint auth methods from metadata. */
export function resolveClientAuthMethods(params: {
  tokenEndpointAuthMethod?: unknown;
  tokenEndpointAuthMethodsSupported?: unknown;
  jwksUri: string | null;
  jwks: JwksDocument | null;
  sourceLabel?: string;
}): {
  tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod;
  allowedAuthMethods: OAuthTokenEndpointAuthMethod[];
} {
  const {
    tokenEndpointAuthMethod: rawMethod,
    tokenEndpointAuthMethodsSupported: rawSupported,
    jwksUri,
    jwks,
    sourceLabel = "CIMD",
  } = params;

  const supportedList = Array.isArray(rawSupported)
    ? rawSupported.filter((m): m is string => typeof m === "string")
    : [];
  const hasJwks = Boolean(jwksUri || jwks);

  let primaryMethod: OAuthTokenEndpointAuthMethod;
  if (rawMethod === undefined || rawMethod === "none") {
    primaryMethod = "none";
  } else if (rawMethod === "private_key_jwt") {
    if (hasJwks) {
      primaryMethod = "private_key_jwt";
    } else if (supportedList.includes("none")) {
      primaryMethod = "none";
    } else {
      throw new Error(
        `${sourceLabel} client using private_key_jwt must declare a valid HTTPS jwks_uri or inline jwks`
      );
    }
  } else if (supportedList.includes("none")) {
    primaryMethod = "none";
  } else {
    throw new Error(
      `Unsupported token_endpoint_auth_method "${String(rawMethod).slice(0, 40)}". Supported methods: none, private_key_jwt`
    );
  }

  const allowedSet = new Set<OAuthTokenEndpointAuthMethod>([primaryMethod]);
  if (supportedList.includes("none")) {
    allowedSet.add("none");
  }
  if (supportedList.includes("private_key_jwt") && hasJwks) {
    allowedSet.add("private_key_jwt");
  }

  return {
    tokenEndpointAuthMethod: primaryMethod,
    allowedAuthMethods: Array.from(allowedSet),
  };
}

async function readResponseUpToLimit(res: Response, maxBytes: number): Promise<string> {
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error("CIMD metadata exceeds maximum allowed size");
  }

  if (!res.body) {
    const text = await res.text();
    if (Buffer.byteLength(text, "utf-8") > maxBytes) {
      throw new Error("CIMD metadata exceeds maximum allowed size");
    }
    return text;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("CIMD metadata exceeds maximum allowed size");
      }
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks).toString("utf-8");
}

async function fetchJsonWithSsrfProtection(
  url: string,
  label: string,
  deps: CimdDependencies = {}
): Promise<{ parsed: URL; rawText: string; data: unknown }> {
  if (!isCimdClientId(url)) {
    throw new Error(`Invalid ${label}: must be an HTTPS URL without credentials or fragments`);
  }

  const parsed = new URL(url);
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error(`${label} host is blocked by SSRF protection`);
  }

  const lookupFn =
    deps.lookup ?? ((hostname: string) => dns.lookup(hostname, { all: true }));
  const resolvedAddrs = await lookupFn(parsed.hostname);
  if (!resolvedAddrs || resolvedAddrs.length === 0) {
    throw new Error(`${label} host did not resolve to any IP address`);
  }

  for (const addr of resolvedAddrs) {
    if (isBlockedIp(addr.address)) {
      throw new Error(`${label} resolved to a blocked IP address`);
    }
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const res = await fetchFn(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`${label} fetch failed with HTTP ${res.status}`);
  }

  const rawText = await readResponseUpToLimit(res, CIMD_MAX_BYTES);
  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`${label} response is not valid JSON`);
  }

  return { parsed, rawText, data };
}

/**
 * Fetches and caches a client's JWK Set with SSRF protection (15-minute TTL).
 */
export async function fetchClientJwks(
  jwksUri: string,
  deps: CimdDependencies = {},
  options?: { bypassCache?: boolean }
): Promise<JwksDocument> {
  const nowMs = deps.now ? deps.now() : Date.now();
  if (!options?.bypassCache) {
    const cached = jwksMemoryCache.get(jwksUri);
    if (cached && cached.expiresAt > nowMs) {
      return cached.jwks;
    }
  }

  const { data } = await fetchJsonWithSsrfProtection(jwksUri, "JWKS", deps);
  const jwks = normalizeInlineJwks(data);
  if (!jwks) {
    throw new Error("JWKS response must contain a non-empty keys array");
  }

  jwksMemoryCache.set(jwksUri, {
    jwks,
    expiresAt: nowMs + JWKS_CACHE_TTL_MS,
  });

  return jwks;
}

/**
 * Fetches, validates (anti-SSRF + schema), caches (1h TTL), and persists a CIMD OAuth client.
 */
export async function resolveCimdClient(
  clientId: string,
  deps: CimdDependencies = {}
): Promise<ResolvedOAuthClient> {
  if (!isCimdClientId(clientId)) {
    throw new Error("Invalid CIMD client_id: must be an HTTPS URL without credentials or fragments");
  }

  const parsedInitial = new URL(clientId);
  if (isBlockedHostname(parsedInitial.hostname)) {
    throw new Error("CIMD client_id host is blocked by SSRF protection");
  }

  const nowMs = deps.now ? deps.now() : Date.now();
  const cached = cimdMemoryCache.get(clientId);
  if (cached && cached.expiresAt > nowMs) {
    return cached.client;
  }

  const { parsed, rawText, data } = await fetchJsonWithSsrfProtection(
    clientId,
    "CIMD client_id",
    deps
  );
  const meta = data as CimdClientMetadata;

  if (!meta || meta.client_id !== clientId) {
    throw new Error("CIMD metadata client_id mismatch");
  }

  if (!Array.isArray(meta.redirect_uris) || meta.redirect_uris.length === 0) {
    throw new Error("CIMD metadata must declare at least one redirect_uri");
  }

  for (const uri of meta.redirect_uris) {
    if (typeof uri !== "string" || !validateRedirectUri(uri)) {
      throw new Error("CIMD metadata contains an invalid redirect_uri");
    }
  }

  let jwksUri: string | null = null;
  if (meta.jwks_uri !== undefined && meta.jwks_uri !== null && meta.jwks_uri !== "") {
    const uriCheck = validateHttpsJwksUri(meta.jwks_uri);
    if (!uriCheck.ok) {
      throw new Error(uriCheck.error);
    }
    jwksUri = uriCheck.uri;
  }

  const inlineJwks = normalizeInlineJwks(meta.jwks);

  const authMethodConfig = resolveClientAuthMethods({
    tokenEndpointAuthMethod: meta.token_endpoint_auth_method,
    tokenEndpointAuthMethodsSupported: meta.token_endpoint_auth_methods_supported,
    jwksUri,
    jwks: inlineJwks,
    sourceLabel: "CIMD",
  });

  const resolved: ResolvedOAuthClient = {
    clientId,
    registrationType: "cimd",
    clientName:
      typeof meta.client_name === "string" && meta.client_name.trim()
        ? meta.client_name.trim()
        : parsed.hostname,
    clientUri:
      typeof meta.client_uri === "string" && meta.client_uri.startsWith("https://")
        ? meta.client_uri
        : null,
    logoUri:
      typeof meta.logo_uri === "string" && meta.logo_uri.startsWith("https://")
        ? meta.logo_uri
        : null,
    redirectUris: meta.redirect_uris,
    tokenEndpointAuthMethod: authMethodConfig.tokenEndpointAuthMethod,
    allowedAuthMethods: authMethodConfig.allowedAuthMethods,
    jwksUri,
    jwks: inlineJwks,
  };

  const expiresAtDate = new Date(nowMs + CIMD_CACHE_TTL_MS);
  const existing = await db.query.mcpOauthClients.findFirst({
    where: eq(mcpOauthClients.clientId, clientId),
  });

  if (existing) {
    await db
      .update(mcpOauthClients)
      .set({
        clientName: resolved.clientName,
        clientUri: resolved.clientUri,
        logoUri: resolved.logoUri,
        redirectUrisJson: JSON.stringify(resolved.redirectUris),
        metadataJson: rawText,
        metadataExpiresAt: expiresAtDate,
        lastUsedAt: new Date(nowMs),
      })
      .where(eq(mcpOauthClients.clientId, clientId));
  } else {
    await db.insert(mcpOauthClients).values({
      clientId: resolved.clientId,
      registrationType: "cimd",
      clientName: resolved.clientName,
      clientUri: resolved.clientUri,
      logoUri: resolved.logoUri,
      redirectUrisJson: JSON.stringify(resolved.redirectUris),
      metadataJson: rawText,
      metadataExpiresAt: expiresAtDate,
      lastUsedAt: new Date(nowMs),
      createdAt: new Date(nowMs),
    });
  }

  cimdMemoryCache.set(clientId, {
    client: resolved,
    expiresAt: nowMs + CIMD_CACHE_TTL_MS,
  });

  return resolved;
}
