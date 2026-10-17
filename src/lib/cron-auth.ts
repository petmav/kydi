import crypto from "node:crypto";

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>` (digests compared, so length does not leak). */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = (header ?? "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(`kydi-cron:${given}`).digest();
  const b = crypto.createHash("sha256").update(`kydi-cron:${secret}`).digest();
  return crypto.timingSafeEqual(a, b) && given.length > 0;
}
