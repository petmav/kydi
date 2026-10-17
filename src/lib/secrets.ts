import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Encryption at rest for third-party credentials (mail passwords, API keys). AES-256-GCM with a key derived
 * from SESSION_SECRET. Format: `v1:<iv b64>:<tag b64>:<ciphertext b64>`. Values never leave the server.
 */

function key(secret = env.sessionSecret): Buffer {
  return createHash("sha256").update(`kydi-secrets:${secret}`).digest();
}

export function encryptSecret(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** Returns null when the value is missing, malformed, tampered with, or was encrypted with another secret. */
export function decryptSecret(stored: string | null | undefined, secret?: string): string | null {
  if (!stored) return null;
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(parts[1], "base64"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function encryptJson(value: Record<string, string>, secret?: string): string | null {
  const clean = Object.fromEntries(Object.entries(value).filter(([, v]) => v));
  return Object.keys(clean).length ? encryptSecret(JSON.stringify(clean), secret) : null;
}

export function decryptJson(stored: string | null | undefined, secret?: string): Record<string, string> {
  const plain = decryptSecret(stored, secret);
  if (!plain) return {};
  try {
    const parsed = JSON.parse(plain) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
