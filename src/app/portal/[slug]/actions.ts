"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPasswordPolicy } from "@/lib/auth/password-policy";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, parseForm, success, zEmail, zPassword, type ActionState } from "@/lib/action";
import { hashPassword, verifyPasswordOrDummy } from "@/lib/auth/password";
import { clientIp } from "@/lib/auth/cookies";
import { createPortalSession, destroyPortalSession, getPortalCompany, requirePortalCustomer } from "@/lib/auth/portal";
import { randomToken, sha256 } from "@/lib/auth/tokens";
import { clearCredentialFailures, rateLimit, throttleCredentials } from "@/lib/rate-limit";
import { sendCompanyMail } from "@/server/mailer";
import { getBaseUrl } from "@/lib/url";
import { setFlash } from "@/lib/flash";
import { estimateTransitions } from "@/domain/status";
import { completeDemoCheckout, startCheckout } from "@/server/online-payments";
import { requestLoginCode, verifyLoginCode } from "@/server/portal-login";
import { normalizeLoginCode } from "@/lib/auth/login-code";

const loginSchema = z.object({ email: zEmail, password: z.string().min(1, "Enter your password.") });

export async function portalLoginAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const company = await getPortalCompany(slug);
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) return parsed.state;
  const { email, password } = parsed.data;
  if (!throttleCredentials(`portal:${company.id}`, await clientIp(), email).ok) return failure("Too many attempts. Please wait a minute and try again.");
  const customer = await db.customer.findFirst({ where: { companyId: company.id, email: { equals: email, mode: "insensitive" } }, omit: { portalPasswordHash: false } });
  const ok = await verifyPasswordOrDummy(customer?.portalPasswordHash, password);
  if (!customer || !ok) return failure("Incorrect email or password.");
  clearCredentialFailures(`portal:${company.id}`, email);
  if (!customer.enablePortal) return failure("Portal access is not enabled for this account. Please contact us.");
  await createPortalSession(customer.id);
  redirect(`/portal/${slug}`);
}

/** Emails a one-time sign-in code. Same answer whether or not the email has portal access. */
export async function portalRequestCodeAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const company = await getPortalCompany(slug);
  const parsed = parseForm(z.object({ email: zEmail }), formData);
  if (!parsed.success) return failure("Enter your email address first.", parsed.state?.fieldErrors);
  const sent = success("If an account exists for that email, a 6-digit code is on its way.", { email: parsed.data.email });
  if (!rateLimit(`portal-code:ip:${await clientIp()}`, 5, 15 * 60_000).ok) return failure("Too many requests. Please try again later.");
  if (!rateLimit(`portal-code:${company.id}:${parsed.data.email.toLowerCase()}`, 3, 15 * 60_000).ok) return sent;
  await requestLoginCode(company, parsed.data.email).catch((e) => console.error("[kydi] sign-in code email failed", e));
  return sent;
}

const codeSchema = z.object({ email: zEmail, code: z.string().trim().min(1, "Enter the 6-digit code.") });

/** Signs a customer in with an emailed code (works whether or not they have set a password). */
export async function portalCodeLoginAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const company = await getPortalCompany(slug);
  const parsed = parseForm(codeSchema, formData);
  if (!parsed.success) return parsed.state;
  const { email } = parsed.data;
  const code = normalizeLoginCode(parsed.data.code);
  if (!code) return failure("Enter the 6-digit code from the email.", { code: ["Enter the 6 digits from the email."] });
  if (!throttleCredentials(`portal-code-login:${company.id}`, await clientIp(), email).ok) return failure("Too many attempts. Please wait a minute and try again.");
  const customerId = await verifyLoginCode(company, email, code);
  if (!customerId) return failure("That code is wrong or has expired. Check the latest email, or send a new code.", { code: ["Wrong or expired code."] });
  clearCredentialFailures(`portal-code-login:${company.id}`, email);
  await createPortalSession(customerId);
  redirect(`/portal/${slug}`);
}

export async function portalLogoutAction(slug: string): Promise<void> {
  await destroyPortalSession();
  redirect(`/portal/${slug}/login`);
}

export async function portalForgotAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const company = await getPortalCompany(slug);
  const parsed = parseForm(z.object({ email: zEmail }), formData);
  if (!parsed.success) return parsed.state;
  if (!rateLimit(`portal-forgot:ip:${await clientIp()}`, 5, 15 * 60_000).ok) return failure("Too many requests. Please try again later.");
  if (!rateLimit(`portal-forgot:${company.id}:${parsed.data.email}`, 3, 60 * 60_000).ok) return success("If an account exists for that email, a reset link is on its way.");
  const customer = await db.customer.findFirst({ where: { companyId: company.id, email: { equals: parsed.data.email, mode: "insensitive" }, enablePortal: true } });
  if (customer?.email) {
    const token = randomToken();
    await db.portalResetToken.create({ data: { tokenHash: sha256(token), customerId: customer.id, expiresAt: new Date(Date.now() + 3600_000) } });
    const link = `${await getBaseUrl()}/portal/${slug}/reset-password/${token}`;
    await sendCompanyMail(company.id, { to: customer.email, subject: `Reset your ${company.name} portal password`, html: `<p>Use this link within 60 minutes to choose a new password:</p><p><a href="${link}">${link}</a></p>` }).catch((e) => console.error(e));
  }
  return success("If an account exists for that email, a reset link is on its way.");
}

const resetSchema = z.object({ token: z.string().min(10), password: zPassword, confirm: z.string() }).refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match." });

export async function portalResetAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const company = await getPortalCompany(slug);
  const parsed = parseForm(resetSchema, formData);
  if (!parsed.success) return parsed.state;
  const rec = await db.portalResetToken.findUnique({ where: { tokenHash: sha256(parsed.data.token) } });
  const customer = rec ? await db.customer.findFirst({ where: { id: rec.customerId, companyId: company.id } }) : null;
  if (!rec || rec.usedAt || rec.expiresAt < new Date() || !customer) return failure("This reset link is invalid or has expired.");
  const portalPasswordHash = await hashPassword(parsed.data.password);
  const done = await db.$transaction(async (tx) => {
    const claimed = await tx.portalResetToken.updateMany({ where: { id: rec.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return false;
    await tx.customer.update({ where: { id: customer.id }, data: { portalPasswordHash } });
    await tx.portalResetToken.deleteMany({ where: { customerId: customer.id, usedAt: null } });
    await tx.portalSession.deleteMany({ where: { customerId: customer.id } });
    return true;
  });
  if (!done) return failure("This reset link is invalid or has expired.");
  await setFlash("Password updated. Sign in with your new password.");
  redirect(`/portal/${slug}/login`);
}

/** Customer accepts or rejects an estimate (only ACCEPTED / REJECTED accepted; spec §6.2). */
export async function portalEstimateDecisionAction(slug: string, id: number, decision: "ACCEPTED" | "REJECTED"): Promise<ActionState> {
  const { customer } = await requirePortalCustomer(slug);
  if (decision !== "ACCEPTED" && decision !== "REJECTED") return failure("Invalid decision.");
  const est = await db.estimate.findFirst({ where: { id, customerId: customer.id, companyId: customer.companyId, status: { not: "DRAFT" } } });
  if (!est) return failure("Estimate not found.");
  if (!estimateTransitions.canCustomerDecide(est.status)) return failure("This estimate can no longer be accepted or rejected.");
  await db.estimate.update({ where: { id }, data: { status: decision } });
  revalidatePath(`/portal/${slug}/estimates/${id}`);
  return success(decision === "ACCEPTED" ? "Thank you — the estimate has been accepted." : "The estimate has been rejected.");
}

const opt = z.string().trim().max(255).optional().transform((v) => v || null);
const profileSchema = z
  .object({
    name: z.string().trim().min(3, "Use at least 3 characters.").max(255),
    email: zEmail,
    password: z.string().optional(),
    confirm: z.string().optional(),
    billingStreet1: opt, billingStreet2: opt, billingCity: opt, billingState: opt, billingZip: opt, billingPhone: opt,
    shippingStreet1: opt, shippingStreet2: opt, shippingCity: opt, shippingState: opt, shippingZip: opt, shippingPhone: opt,
  })
  .superRefine((d, c) => {
    { const weak = d.password ? checkPasswordPolicy(d.password) : null; if (weak) c.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: weak }); }
    if (d.password && d.password !== d.confirm) c.addIssue({ code: z.ZodIssueCode.custom, path: ["confirm"], message: "Passwords do not match." });
  });

export async function portalProfileAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { customer } = await requirePortalCustomer(slug);
  const parsed = parseForm(profileSchema, formData);
  if (!parsed.success) return parsed.state;
  const { password, confirm: _c, ...data } = parsed.data;
  void _c;
  if (await db.customer.findFirst({ where: { companyId: customer.companyId, email: data.email, NOT: { id: customer.id } } })) {
    return failure("This email is already in use.", { email: ["This email is already in use."] });
  }
  await db.customer.update({ where: { id: customer.id }, data: { ...data, ...(password ? { portalPasswordHash: await hashPassword(password) } : {}) } });
  revalidatePath(`/portal/${slug}`, "layout");
  return success("Profile updated.");
}

/** Starts paying an invoice's full outstanding balance (Stripe Checkout or the demo gateway). */
export async function portalPayInvoiceAction(slug: string, invoiceId: number): Promise<ActionState> {
  const { customer } = await requirePortalCustomer(slug);
  if (!rateLimit(`portal-pay:${customer.id}`, 10, 60_000).ok) return failure("Too many attempts. Please wait a minute.");
  const r = await startCheckout(slug, customer, invoiceId);
  if (!r.ok) return failure(r.error);
  redirect(r.url);
}

/** Demo gateway "Pay" button: records the payment without moving money. */
export async function portalDemoPayAction(slug: string, ref: string): Promise<ActionState> {
  const { customer } = await requirePortalCustomer(slug);
  const r = await completeDemoCheckout(customer, ref);
  if (!r.ok) return failure(r.error);
  revalidatePath(`/portal/${slug}`, "layout");
  await setFlash("Payment received. Thank you!");
  redirect(`/portal/${slug}/invoices/${r.invoiceId}`);
}
