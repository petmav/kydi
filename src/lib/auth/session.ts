import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { randomToken, sha256, signValue, unsignValue } from "@/lib/auth/tokens";

export const SESSION_COOKIE = "halyard_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function isSecureRequest(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export async function createSession(userId: number): Promise<void> {
  const token = randomToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, userAgent: h.get("user-agent")?.slice(0, 255) ?? null },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signValue(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: await isSecureRequest(),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = unsignValue(jar.get(SESSION_COOKIE)?.value);
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Returns the signed-in user for this request, or null. Cached per request. */
export const getSessionUser = cache(async () => {
  const jar = await cookies();
  const token = unsignValue(jar.get(SESSION_COOKIE)?.value);
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
  const jar = await cookies();
  const token = unsignValue(jar.get(SESSION_COOKIE)?.value);
  await db.session.deleteMany({
    where: { userId, ...(exceptCurrent && token ? { NOT: { tokenHash: sha256(token) } } : {}) },
  });
}
