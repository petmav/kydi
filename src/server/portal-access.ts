import type { Company, Customer } from "@prisma/client";
import { db } from "@/lib/db";
import { getCompanySettings, yes } from "@/lib/settings";
import { randomToken, sha256 } from "@/lib/auth/tokens";
import { getBaseUrl } from "@/lib/url";
import { decidePortalAccess, SETUP_LINK_DAYS } from "@/domain/portal-access";
import { sendCompanyMail } from "@/server/mailer";

/**
 * Automatic portal access for invoice recipients (see src/domain/portal-access.ts). Called whenever an invoice
 * becomes sent (emailed, marked as sent, saved-and-sent, recurring auto-send). Failures are logged and never
 * stop the invoice from being sent.
 */

export type PortalInfo = { loginUrl: string; email: string };

export async function portalLoginUrl(company: Pick<Company, "slug">): Promise<string> {
  return `${await getBaseUrl()}/portal/${company.slug}/login`;
}

async function liveSetupLink(customerId: number): Promise<boolean> {
  return (await db.portalResetToken.count({ where: { customerId, usedAt: null, expiresAt: { gt: new Date() } } })) > 0;
}

/**
 * What documents for this customer should say about the portal right now, without side effects: the login URL
 * and the customer's login email when portal access is on, or would be switched on by sending.
 */
export async function portalInfoFor(company: Company, customer: Pick<Customer, "email" | "enablePortal" | "portalOptOut">): Promise<PortalInfo | null> {
  const s = await getCompanySettings(company.id);
  const d = decidePortalAccess({ auto: yes(s.auto_portal_access), email: customer.email, enablePortal: customer.enablePortal, optOut: customer.portalOptOut, hasPassword: true, hasLiveSetupLink: true });
  return d.enabled && customer.email ? { loginUrl: await portalLoginUrl(company), email: customer.email } : null;
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
    return { loginUrl: await portalLoginUrl(company), email: customer.email };
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
  const link = `${base}/portal/${company.slug}/reset-password/${token}?setup=1`;
  // Lazy import: email.ts calls into this module when sending invoices.
  const { layout } = await import("./email");
  const html = layout({
    companyName: company.name,
    logoUrl: company.logoPath ? `${base}/api/files/logo/${company.uniqueHash}` : null,
    body: `<p>Hello ${esc(name)},</p><p>${esc(company.name)} has set up a customer portal for you, where you can view, download and pay your invoices at any time.</p><p>You sign in with your email address, <strong>${esc(email)}</strong>. Choose your password with the button below. The link works once and expires in ${SETUP_LINK_DAYS} days; after that, use “Forgot password?” on the sign-in page.</p>`,
    buttonLabel: "Set up your portal access",
    link,
    extra: `<p style="font-size:12px;color:#64748b">If the button does not work, copy this link into your browser:<br>${esc(link)}</p>`,
  });
  await sendCompanyMail(company.id, { to: email, subject: `Your ${company.name} customer portal`, html });
}
