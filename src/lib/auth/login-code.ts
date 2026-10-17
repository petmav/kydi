import crypto from "node:crypto";
import { sign, signValue, unsignValue } from "@/lib/auth/tokens";

/** Passwordless portal sign-in: a 6-digit code emailed to the customer, plus signed "who is this" link hints. */

export const LOGIN_CODE_TTL_MS = 10 * 60_000;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

export function generateLoginCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Keyed hash bound to the customer, so a leaked table row cannot be checked offline or reused for another customer. */
export function hashLoginCode(customerId: number, code: string): string {
  return sign(`portal-login-code:${customerId}:${code}`);
}

export function loginCodeMatches(customerId: number, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashLoginCode(customerId, code));
  const b = Buffer.from(storedHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Accepts "123456", "123 456" or "123-456"; returns the 6 digits or null. */
export function normalizeLoginCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/**
 * Opaque, tamper-proof link parameter that lets the sign-in page fill in the customer's email without putting the
 * address itself in URLs (which end up in history, logs and forwarded PDFs).
 */
export function loginHint(customerId: number): string {
  return signValue(`c${customerId}`);
}

export function readLoginHint(hint: string | null | undefined): number | null {
  const v = unsignValue(hint ?? null);
  const m = v ? /^c(\d+)$/.exec(v) : null;
  return m ? Number(m[1]) : null;
}
