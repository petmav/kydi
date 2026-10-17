import { db } from "@/lib/db";

/** Advisory lock keys (any stable 32-bit integers unique to Kydi). */
export const LOCKS = { scheduler: 7239010, boot: 7239011 } as const;

/**
 * Runs `fn` while holding a Postgres transaction-scoped advisory lock, so that only one process (replica) does
 * the work at a time; others skip immediately. The lock lives on one pooled connection for the duration and is
 * released when the wrapping transaction ends (also if the process dies). `fn` uses `db` normally.
 */
export async function withAdvisoryLock<T>(key: number, fn: () => Promise<T>, timeoutMs = 10 * 60_000): Promise<{ acquired: true; result: T } | { acquired: false }> {
  return db.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${key}::bigint) AS locked`;
      if (!rows[0]?.locked) return { acquired: false as const };
      return { acquired: true as const, result: await fn() };
    },
    { timeout: timeoutMs, maxWait: 15_000 },
  );
}
