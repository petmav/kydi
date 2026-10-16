import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { randomToken, sha256, signValue, unsignValue } from "@/lib/auth/tokens";
import { isSecureRequest } from "@/lib/auth/session";

/** Customer-portal sessions: separate cookie and table from staff sessions (spec §6.1). */
export const PORTAL_COOKIE = "kydi_portal";
const TTL = 1000 * 60 * 60 * 24 * 14;

export const getPortalCompany = cache(async (slug: string) => {
  const company = await db.company.findUnique({ where: { slug } });
  if (!company) notFound();
  return company;
});

export async function createPortalSession(customerId: number) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + TTL);
  await db.portalSession.create({ data: { tokenHash: sha256(token), customerId, expiresAt } });
  (await cookies()).set(PORTAL_COOKIE, signValue(token), { httpOnly: true, sameSite: "lax", secure: await isSecureRequest(), path: "/", expires: expiresAt });
}

export async function destroyPortalSession() {
  const jar = await cookies();
  const token = unsignValue(jar.get(PORTAL_COOKIE)?.value);
  if (token) await db.portalSession.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(PORTAL_COOKIE);
}

/** Returns the signed-in customer for this portal (company slug), or null. */
export const getPortalCustomer = cache(async (slug: string) => {
  const company = await getPortalCompany(slug);
  const token = unsignValue((await cookies()).get(PORTAL_COOKIE)?.value);
  if (!token) return null;
  const s = await db.portalSession.findUnique({ where: { tokenHash: sha256(token) }, include: { customer: true } });
  if (!s || s.expiresAt < new Date() || s.customer.companyId !== company.id || !s.customer.enablePortal) return null;
  return { customer: s.customer, company };
});

export async function requirePortalCustomer(slug: string) {
  const r = await getPortalCustomer(slug);
  if (!r) redirect(`/portal/${slug}/login`);
  return r;
}
