import { db } from "@/lib/db";

/**
 * Data-retention sweep (runs with the scheduler): removes expired staff and portal sessions and password-reset
 * tokens that are expired or were used more than a day ago. Business records are never deleted automatically.
 */
export async function purgeExpiredAuthRecords(now = new Date()): Promise<{ sessions: number; portalSessions: number; resetTokens: number }> {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const [sessions, portalSessions, staffTokens, portalTokens] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.portalSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: dayAgo } }] } }),
    db.portalResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: dayAgo } }] } }),
  ]);
  return { sessions: sessions.count, portalSessions: portalSessions.count, resetTokens: staffTokens.count + portalTokens.count };
}
