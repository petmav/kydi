import crypto from "node:crypto";
import { env } from "@/lib/env";

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function sign(value: string): string {
  return crypto.createHmac("sha256", env.sessionSecret).update(value).digest("base64url");
}

/** Returns `value.signature`. */
export function signValue(value: string): string {
  return `${value}.${sign(value)}`;
}

/** Verifies a `value.signature` string; returns the value or null. */
export function unsignValue(signed: string | undefined | null): string | null {
  if (!signed) return null;
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const sig = Buffer.from(signed.slice(idx + 1));
  const expected = Buffer.from(sign(value));
  if (sig.length !== expected.length) return null;
  return crypto.timingSafeEqual(sig, expected) ? value : null;
}
