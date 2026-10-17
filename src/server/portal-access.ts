import type { Company, Customer } from "@prisma/client";
import { db } from "@/lib/db";
import { getCompanySettings, yes } from "@/lib/settings";
import { randomToken, sha256 } from "@/lib/auth/tokens";
import { getBaseUrl } from "@/lib/url";
import { decidePortalAccess, SETUP_LINK_DAYS } from "@/domain/portal-access";
import { loginHint } from "@/lib/auth/login-code";
import { sendCompanyMail } from "@/server/mailer";

/**
 * Automatic portal access for invoice recipients (see src/domain/portal-access.ts). Called whenever an invoice
 * becomes sent (emailed, marked as sent, saved-and-sent, recurring auto-send). Failures are logged and never
 * stop the invoice from being sent.
 */

/** `loginUrl` carries a signed hint that pre-fills the customer's email; `displayUrl` is the plain address to show. */
export type PortalInfo = { loginUrl: string; displayUrl: string; email: string };

export async function portalLoginUrl(company: Pick<Company, "slug">, customerId?: number): Promise<string> {
  const url = `${await getBaseUrl()}/portal/${company.slug}/login`;
  return customerId ? `${url}?u=${encodeURIComponent(loginHint(customerId))}` : url;
}

async function portalInfo(company: Company, customerId: number, email: string): Promise<PortalInfo> {
  return { loginUrl: await portalLoginUrl(company, customerId), displayUrl: await portalLoginUrl(company), email };
}

async function liveSetupLink(customerId: number): Promise<boolean> {
  return (await db.portalResetToken.count({ where: { customerId, usedAt: null, expiresAt: { gt: new Date() } } })) > 0;
}

/**
 * What documents for this customer should say about the portal right now, without side effects: the login URL
 * and the customer's login email when portal access is on, or would be switched on by sending.
 */
export async function portalInfoFor(company: Company, customer: Pick<Customer, "id" | "email" | "enablePortal" | "portalOptOut">): Promise<PortalInfo | null> {
  const s = await getCompanySettings(company.id);
  const d = decidePortalAccess({ auto: yes(s.auto_portal_access), email: customer.email, enablePortal: customer.enablePortal, optOut: customer.portalOptOut, hasPassword: true, hasLiveSetupLink: true });
  return d.enabled && customer.email ? portalInfo(company, customer.id, customer.email) : null;
}

/** Switches the invoice customer's portal access on and emails a setup link when they have no password yet. */
export async function ensurePortalAccess(companyId: number, customerId: number): Promise<PortalInfo | null> {
  try {
    const [s, customer, company] = await Promise.all([
      getCompanySettings(companyId),
      db.customer.findFirst({ where: { id: customerId, companyId } }),
      db.company.findUnique({ where: { id: companyId } }),
    ]);
    if (!customer || !company) return null;
    const d = decidePortalAccess({
      auto: yes(s.auto_portal_access),
      email: customer.email,
      enablePortal: customer.enablePortal,
      optOut: customer.portalOptOut,
      // The hash itself is omitted from query results (src/lib/db.ts); only its presence matters here.
      hasPassword: (await db.customer.count({ where: { id: customer.id, portalPasswordHash: { not: null } } })) > 0,
      hasLiveSetupLink: await liveSetupLink(customer.id),
    });
    if (d.enable) await db.customer.update({ where: { id: customer.id }, data: { enablePortal: true } });
    if (!d.enabled || !customer.email) return null;
    if (d.invite) await sendSetupInvite(company, customer.id, customer.name, customer.email);
    return portalInfo(company, customer.id, customer.email);
  } catch (e) {
    console.error("[kydi] automatic portal access failed", e);
    return null;
  }
}

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Emails a one-time setup link to the customer's own address only (never to CC/BCC or an edited recipient). */
async function sendSetupInvite(company: Company, customerId: number, name: string, email: string) {
  const token = randomToken();
  await db.portalResetToken.create({ data: { tokenHash: sha256(token), customerId, expiresAt: new Date(Date.now() + SETUP_LINK_DAYS * 86_400_000) } });
  const base = await getBaseUrl();
  const signIn = await portalLoginUrl(company, customerId);
  const setPassword = `${base}/portal/${company.slug}/reset-password/${token}?setup=1`;
  // Lazy import: email.ts calls into this module when sending invoices.
  const { layout } = await import("./email");
  const html = layout({
    companyName: company.name,
    logoUrl: company.logoPath ? `${base}/api/files/logo/${company.uniqueHash}` : null,
    body: `<p>Hello ${esc(name)},</p><p>${esc(company.name)} has set up a customer portal for you, where you can view, download and pay your invoices at any time.</p><p>No password needed: open the portal and choose <strong>Email me a sign-in code</strong>, and we send a 6-digit code to <strong>${esc(email)}</strong>.</p>`,
    buttonLabel: "Open your portal",
    link: signIn,
    extra: `<p>Prefer a password? <a href="${esc(setPassword)}" style="color:#1d4ed8">Set one now</a> (link valid ${SETUP_LINK_DAYS} days), or any time later under Settings in the portal. Sign-in codes keep working either way.</p><p style="font-size:12px;color:#64748b">If the links do not work, copy them into your browser:<br>Portal: ${esc(signIn)}<br>Set a password: ${esc(setPassword)}</p>`,
  });
  await sendCompanyMail(company.id, { to: email, subject: `Your ${company.name} customer portal`, html });
}
