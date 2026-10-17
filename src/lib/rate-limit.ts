/** Tiny in-memory fixed-window rate limiter (per process; the manifest runs a single replica). */
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 50_000;

function sweep(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) return { ok: false, retryAfterMs: bucket.resetAt - now };
  return { ok: true, retryAfterMs: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/**
 * Credential throttling (spec §2.2: 10 attempts per minute per client) plus a per-account budget of 20 attempts
 * per 15 minutes that slows distributed guessing against one account. Both must pass.
 */
export function throttleCredentials(scope: string, ip: string, account: string): { ok: boolean; retryAfterMs: number } {
  const perIp = rateLimit(`${scope}:ip:${ip}`, 10, 60_000);
  const perAccount = rateLimit(`${scope}:acct:${account.toLowerCase()}`, 20, 15 * 60_000);
  if (perIp.ok && perAccount.ok) return { ok: true, retryAfterMs: 0 };
  return { ok: false, retryAfterMs: Math.max(perIp.retryAfterMs, perAccount.retryAfterMs) };
}

export function clearCredentialFailures(scope: string, account: string) {
  resetRateLimit(`${scope}:acct:${account.toLowerCase()}`);
}
