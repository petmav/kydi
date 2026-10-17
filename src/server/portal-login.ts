import type { Company } from "@prisma/client";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/url";
import { generateLoginCode, hashLoginCode, LOGIN_CODE_MAX_ATTEMPTS, LOGIN_CODE_TTL_MS, loginCodeMatches, loginHint } from "@/lib/auth/login-code";
import { sendCompanyMail } from "@/server/mailer";
import { layout } from "@/server/email";

/**
 * Passwordless portal sign-in by emailed code. Always available to customers with portal access, whether or not
 * they have set a password. Callers rate-limit and answer identically whether or not the email has an account.
 */

async function portalCustomerByEmail(companyId: number, email: string) {
  return db.customer.findFirst({ where: { companyId, enablePortal: true, email: { equals: email.trim(), mode: "insensitive" } } });
}

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Emails a fresh code (earlier unused codes stop working). Silent when the email has no portal account. */
export async function requestLoginCode(company: Company, email: string): Promise<void> {
  const customer = await portalCustomerByEmail(company.id, email);
  if (!customer?.email) return;
  const code = generateLoginCode();
  await db.$transaction([
    db.portalLoginCode.deleteMany({ where: { customerId: customer.id, usedAt: null } }),
    db.portalLoginCode.create({ data: { customerId: customer.id, codeHash: hashLoginCode(customer.id, code), expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS) } }),
  ]);
  const base = await getBaseUrl();
  const html = layout({
    companyName: company.name,
    logoUrl: company.logoPath ? `${base}/api/files/logo/${company.uniqueHash}` : null,
    body: `<p>Your sign-in code for the ${esc(company.name)} customer portal is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p><p>It works once and expires in ${LOGIN_CODE_TTL_MS / 60_000} minutes. If you did not ask for it, you can ignore this email.</p>`,
    buttonLabel: "Open the sign-in page",
    link: `${base}/portal/${company.slug}/login?u=${encodeURIComponent(loginHint(customer.id))}`,
  });
  await sendCompanyMail(company.id, { to: customer.email, subject: `${code} is your ${company.name} sign-in code`, html });
}

/** Returns the customer id when the code is right; counts wrong tries and cancels the code after the limit. */
export async function verifyLoginCode(company: Company, email: string, code: string): Promise<number | null> {
  const customer = await portalCustomerByEmail(company.id, email);
  if (!customer) return null;
  const rec = await db.portalLoginCode.findFirst({ where: { customerId: customer.id, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: LOGIN_CODE_MAX_ATTEMPTS } }, orderBy: { id: "desc" } });
  if (!rec) return null;
  if (!loginCodeMatches(customer.id, code, rec.codeHash)) {
    await db.portalLoginCode.updateMany({ where: { id: rec.id, attempts: { lt: LOGIN_CODE_MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
    return null;
  }
  // Claim it atomically so the same code cannot open two sessions.
  const claimed = await db.portalLoginCode.updateMany({ where: { id: rec.id, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: LOGIN_CODE_MAX_ATTEMPTS } }, data: { usedAt: new Date() } });
  return claimed.count === 1 ? customer.id : null;
}

/** Email to pre-fill on the sign-in page from a signed link hint, when it belongs to this portal. */
export async function emailForLoginHint(companyId: number, customerId: number | null): Promise<string | null> {
  if (!customerId) return null;
  const c = await db.customer.findFirst({ where: { id: customerId, companyId, enablePortal: true }, select: { email: true } });
  return c?.email ?? null;
}
