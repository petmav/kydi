import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { randomToken, sha256, signValue, unsignValue } from "@/lib/auth/tokens";
import { secureCookies } from "@/lib/auth/cookies";

export { isSecureRequest } from "@/lib/auth/cookies";

export const SESSION_COOKIE = "kydi_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

async function currentToken(): Promise<string | null> {
  return unsignValue((await cookies()).get(SESSION_COOKIE)?.value);
}

/**
 * Starts a new database-backed session with a fresh random token (session rotation: any session the browser
 * presented before is deleted, so a pre-set cookie can never be promoted to an authenticated one).
 */
export async function createSession(userId: number): Promise<void> {
  const previous = await currentToken();
  if (previous) await db.session.deleteMany({ where: { tokenHash: sha256(previous) } });
  const token = randomToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, userAgent: h.get("user-agent")?.slice(0, 255) ?? null },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signValue(token), { ...(await secureCookies()), expires: expiresAt });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = unsignValue(jar.get(SESSION_COOKIE)?.value);
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Returns the signed-in user for this request, or null. Cached per request. */
export const getSessionUser = cache(async () => {
  const token = await currentToken();
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
});

export async function destroyAllSessions(userId: number, exceptCurrent = true): Promise<void> {
  const token = await currentToken();
  await db.session.deleteMany({
    where: { userId, ...(exceptCurrent && token ? { NOT: { tokenHash: sha256(token) } } : {}) },
  });
}

/** After a credential change: revoke every session of the user and issue a new one for this browser. */
export async function rotateSessions(userId: number): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
  await createSession(userId);
}
