import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Encryption at rest for third-party credentials (mail passwords, API keys). Values never leave the server.
 *
 * - `v2:<iv>:<tag>:<ciphertext>` (current): AES-256-GCM, key = HKDF-SHA256(APP_ENCRYPTION_KEY).
 * - `v1:<iv>:<tag>:<ciphertext>` (legacy, read-only): AES-256-GCM, key = SHA-256("kydi-secrets:" + SESSION_SECRET).
 *
 * Legacy values are re-encrypted to v2 at boot (src/server/secret-migration.ts), after which rotating
 * SESSION_SECRET no longer affects stored credentials. APP_ENCRYPTION_KEY itself must never change.
 */

function v2Key(material: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(material, "utf8"), Buffer.from("kydi-secrets"), Buffer.from("v2:aes-256-gcm"), 32));
}

function v1Key(sessionSecret: string): Buffer {
  return createHash("sha256").update(`kydi-secrets:${sessionSecret}`).digest();
}

function seal(version: "v1" | "v2", key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [version, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

function open(parts: string[], key: Buffer): string | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Encrypts with the current scheme (v2). `keyMaterial` defaults to APP_ENCRYPTION_KEY. */
export function encryptSecret(plain: string, keyMaterial: string = env.encryptionKey): string {
  return seal("v2", v2Key(keyMaterial), plain);
}

/** Test/migration helper: produces a legacy v1 value exactly as releases before 0.2.0 did. */
export function encryptSecretLegacy(plain: string, sessionSecret: string): string {
  return seal("v1", v1Key(sessionSecret), plain);
}

/**
 * Returns null when the value is missing, malformed, tampered with, or was encrypted with another key.
 * v1 values are tried against each legacy secret (SESSION_SECRET, KYDI_LEGACY_SESSION_SECRET).
 */
export function decryptSecret(stored: string | null | undefined, keyMaterial?: string, legacySecrets?: string[]): string | null {
  if (!stored) return null;
  const parts = stored.split(":");
  if (parts.length !== 4) return null;
  if (parts[0] === "v2") return open(parts, v2Key(keyMaterial ?? env.encryptionKey));
  if (parts[0] === "v1") {
    for (const secret of legacySecrets ?? (keyMaterial ? [keyMaterial] : env.legacySecrets)) {
      const plain = open(parts, v1Key(secret));
      if (plain !== null) return plain;
    }
  }
  return null;
}

export function isLegacySecret(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith("v1:");
}

/**
 * Re-encrypts a legacy v1 value as v2. Returns the new value, the input unchanged when it is already v2 or
 * empty, or null when the legacy value cannot be decrypted with any known secret (left untouched by callers).
 */
export function reencryptLegacy(stored: string | null | undefined, keyMaterial?: string, legacySecrets?: string[]): string | null | undefined {
  if (!isLegacySecret(stored)) return stored;
  const plain = decryptSecret(stored, undefined, legacySecrets ?? env.legacySecrets);
  return plain === null ? null : encryptSecret(plain, keyMaterial ?? env.encryptionKey);
}

export function encryptJson(value: Record<string, string>, keyMaterial?: string): string | null {
  const clean = Object.fromEntries(Object.entries(value).filter(([, v]) => v));
  return Object.keys(clean).length ? encryptSecret(JSON.stringify(clean), keyMaterial) : null;
}

export function decryptJson(stored: string | null | undefined, keyMaterial?: string): Record<string, string> {
  const plain = decryptSecret(stored, keyMaterial);
  if (!plain) return {};
  try {
    const parsed = JSON.parse(plain) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
