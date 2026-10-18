import crypto from "node:crypto";

const HKDF_INFO = "recomp_integrations_aes_gcm";
const HKDF_SALT = Buffer.from("recomp_integrations_salt_v1", "utf-8");

/**
 * Derives a 256-bit (32-byte) key for AES-256-GCM.
 * Prioritizes INTEGRATIONS_ENCRYPTION_KEY if provided;
 * otherwise derives via HKDF-SHA256 from JWT_SECRET / SECRET_KEY.
 */
export function getIntegrationsEncryptionKey(): Buffer {
  const explicitKey = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (explicitKey) {
    const trimmed = explicitKey.trim();
    // 64-char hex string = 32 bytes
    if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
      return Buffer.from(trimmed, "hex");
    }
    // 44-char base64 string = 32 bytes
    if (trimmed.length === 44 && /^[A-Za-z0-9+/=]+$/.test(trimmed)) {
      const buf = Buffer.from(trimmed, "base64");
      if (buf.length === 32) return buf;
    }
    // Fallback: SHA-256 digest of provided raw string
    return crypto.createHash("sha256").update(trimmed).digest();
  }

  const baseSecret =
    process.env.JWT_SECRET ||
    process.env.SECRET_KEY ||
    "recomp_pro_super_secret_key_12345_change_in_production";

  const derivedKey = crypto.hkdfSync(
    "sha256",
    Buffer.from(baseSecret, "utf-8"),
    HKDF_SALT,
    Buffer.from(HKDF_INFO, "utf-8"),
    32
  );

  return Buffer.from(derivedKey);
}

export interface EncryptedEnvelope {
  v: 1;
  iv: string; // base64
  tag: string; // base64
  data: string; // base64
}

/**
 * Encrypts a plaintext string using AES-256-GCM with a random 96-bit IV.
 * Returns a serialized JSON envelope string safe for database storage.
 */
export function encryptString(plaintext: string): string {
  const key = getIntegrationsEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf-8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const envelope: EncryptedEnvelope = {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };

  return JSON.stringify(envelope);
}

/**
 * Decrypts a serialized JSON envelope string using AES-256-GCM.
 * Throws an error if tampering, invalid tag, or malformed envelope is detected.
 */
export function decryptString(encryptedEnvelopeJson: string): string {
  const envelope = JSON.parse(encryptedEnvelopeJson) as EncryptedEnvelope;
  if (!envelope || envelope.v !== 1 || !envelope.iv || !envelope.tag || !envelope.data) {
    throw new Error("Invalid or unsupported encrypted envelope format");
  }

  const key = getIntegrationsEncryptionKey();
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const encrypted = Buffer.from(envelope.data, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf-8");
}

/**
 * Encrypts an arbitrary object into a serialized encrypted JSON envelope.
 */
export function encryptJson<T>(data: T): string {
  return encryptString(JSON.stringify(data));
}

/**
 * Decrypts a serialized encrypted envelope back to an object.
 */
export function decryptJson<T>(encryptedEnvelopeJson: string): T {
  const plaintext = decryptString(encryptedEnvelopeJson);
  return JSON.parse(plaintext) as T;
}
