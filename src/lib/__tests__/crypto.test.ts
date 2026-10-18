import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptString,
  decryptString,
  encryptJson,
  decryptJson,
  getIntegrationsEncryptionKey,
} from "../crypto";

describe("Crypto Module (AES-256-GCM Envelope Encryption)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should derive a 32-byte key from default JWT_SECRET via HKDF", () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    process.env.JWT_SECRET = "test_jwt_secret_value_1234567890";
    const key = getIntegrationsEncryptionKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("should prioritize 64-char hex INTEGRATIONS_ENCRYPTION_KEY", () => {
    const hexKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.INTEGRATIONS_ENCRYPTION_KEY = hexKey;
    const key = getIntegrationsEncryptionKey();
    expect(key.toString("hex")).toBe(hexKey);
    expect(key.length).toBe(32);
  });

  it("should encrypt and decrypt plaintext strings correctly", () => {
    const plaintext = "my-super-secret-fitdays-password-hash";
    const encrypted = encryptString(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain('"v":1');
    expect(encrypted).toContain('"iv":');
    expect(encrypted).toContain('"tag":');
    expect(encrypted).toContain('"data":');

    const decrypted = decryptString(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertexts for the same plaintext due to random IV", () => {
    const plaintext = "repeatable-text";
    const enc1 = encryptString(plaintext);
    const enc2 = encryptString(plaintext);

    expect(enc1).not.toBe(enc2);
    expect(decryptString(enc1)).toBe(plaintext);
    expect(decryptString(enc2)).toBe(plaintext);
  });

  it("should throw an error if ciphertext or auth tag is tampered with", () => {
    const plaintext = "sensitive-credentials";
    const encrypted = encryptString(plaintext);
    const parsed = JSON.parse(encrypted);

    // Tamper with data
    parsed.data = Buffer.from("tampered_content").toString("base64");
    const tampered = JSON.stringify(parsed);

    expect(() => decryptString(tampered)).toThrow();
  });

  it("should encrypt and decrypt objects correctly using JSON helpers", () => {
    const credentials = {
      email: "user@example.com",
      passwordHash: "5f4dcc3b5aa765d61d8327deb882cf99",
      token: "eyJhbGciOi...",
      uid: 123456,
      clientId: "test-client-id",
    };

    const encrypted = encryptJson(credentials);
    const decrypted = decryptJson<typeof credentials>(encrypted);

    expect(decrypted).toEqual(credentials);
    expect(decrypted.email).toBe("user@example.com");
    expect(decrypted.uid).toBe(123456);
  });
});
