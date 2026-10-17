import { db } from "@/lib/db";
import { isLegacySecret, reencryptLegacy } from "@/lib/secrets";

/**
 * One-way migration of stored credentials from the legacy SESSION_SECRET-derived key (v1) to
 * APP_ENCRYPTION_KEY (v2). Idempotent: only v1 rows are touched, and each row is updated only if it still
 * holds the value that was read. Values that no known secret can decrypt are left as they are and counted.
 */
export async function migrateLegacySecrets(): Promise<{ migrated: number; unreadable: number }> {
  let migrated = 0;
  let unreadable = 0;

  const mail = await db.mailConfig.findMany({ where: { secrets: { startsWith: "v1:" } }, select: { id: true, secrets: true } });
  for (const row of mail) {
    if (!isLegacySecret(row.secrets)) continue;
    const next = reencryptLegacy(row.secrets);
    if (!next) {
      unreadable += 1;
      continue;
    }
    const r = await db.mailConfig.updateMany({ where: { id: row.id, secrets: row.secrets }, data: { secrets: next } });
    migrated += r.count;
  }

  const providers = await db.exchangeRateProvider.findMany({ where: { keyEncrypted: { startsWith: "v1:" } }, select: { id: true, keyEncrypted: true } });
  for (const row of providers) {
    const next = reencryptLegacy(row.keyEncrypted);
    if (!next) {
      unreadable += 1;
      continue;
    }
    const r = await db.exchangeRateProvider.updateMany({ where: { id: row.id, keyEncrypted: row.keyEncrypted }, data: { keyEncrypted: next } });
    migrated += r.count;
  }

  return { migrated, unreadable };
}
