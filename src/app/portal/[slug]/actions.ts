"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, parseForm, success, zEmail, zPassword, type ActionState } from "@/lib/action";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createPortalSession, destroyPortalSession, getPortalCompany, requirePortalCustomer } from "@/lib/auth/portal";
import { randomToken, sha256 } from "@/lib/auth/tokens";
import { rateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mail";
import { getBaseUrl } from "@/lib/url";
import { setFlash } from "@/lib/flash";
import { estimateTransitions } from "@/domain/status";

const loginSchema = z.object({ email: zEmail, password: z.string().min(1, "Enter your password.") });

export async function portalLoginAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const company = await getPortalCompany(slug);
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) return parsed.state;
  const { email, password } = parsed.data;
  if (!rateLimit(`portal:${company.id}:${email}`, 10, 60_000).ok) return failure("Too many attempts. Please wait a minute and try again.");
  const customer = await db.customer.findFirst({ where: { companyId: company.id, email: { equals: email, mode: "insensitive" } } });
  const ok = customer?.portalPasswordHash ? await verifyPassword(customer.portalPasswordHash, password) : false;
  if (!customer || !ok) return failure("Incorrect email or password.");
  if (!customer.enablePortal) return failure("Portal access is not enabled for this account. Please contact us.");
  await createPortalSession(customer.id);
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
  if (!rateLimit(`portal-forgot:${company.id}:${parsed.data.email}`, 5, 15 * 60_000).ok) return failure("Too many requests. Please try again later.");
  const customer = await db.customer.findFirst({ where: { companyId: company.id, email: { equals: parsed.data.email, mode: "insensitive" }, enablePortal: true } });
  if (customer?.email) {
    const token = randomToken();
    await db.portalResetToken.create({ data: { tokenHash: sha256(token), customerId: customer.id, expiresAt: new Date(Date.now() + 3600_000) } });
    const link = `${await getBaseUrl()}/portal/${slug}/reset-password/${token}`;
    await sendMail({ to: customer.email, subject: `Reset your ${company.name} portal password`, html: `<p>Use this link within 60 minutes to choose a new password:</p><p><a href="${link}">${link}</a></p>` }).catch((e) => console.error(e));
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
  await db.$transaction([
    db.customer.update({ where: { id: customer.id }, data: { portalPasswordHash: await hashPassword(parsed.data.password) } }),
    db.portalResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    db.portalSession.deleteMany({ where: { customerId: customer.id } }),
  ]);
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
    if (d.password && d.password.length < 8) c.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Use at least 8 characters." });
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
