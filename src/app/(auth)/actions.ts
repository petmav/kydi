"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, parseForm, success, zEmail, zPassword, type ActionState } from "@/lib/action";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { randomToken, sha256 } from "@/lib/auth/tokens";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { sendPlatformMail } from "@/server/mailer";
import { getBaseUrl, safeNext } from "@/lib/url";
import { setFlash } from "@/lib/flash";

async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

const loginSchema = z.object({
  email: zEmail,
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) return parsed.state;
  const { email, password, next } = parsed.data;

  const key = `login:${await clientIp()}:${email}`;
  const limit = rateLimit(key, 8, 15 * 60 * 1000);
  if (!limit.ok) {
    return failure(`Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfterMs / 60000)} minute(s).`);
  }

  const user = await db.user.findUnique({ where: { email } });
  const valid = user ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !valid) {
    return failure("Incorrect email or password.", { password: ["Incorrect email or password."] });
  }
  resetRateLimit(key);
  await createSession(user.id);
  redirect(safeNext(next));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const forgotSchema = z.object({ email: zEmail });

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(forgotSchema, formData);
  if (!parsed.success) return parsed.state;
  const { email } = parsed.data;

  const limit = rateLimit(`forgot:${await clientIp()}`, 5, 15 * 60 * 1000);
  if (!limit.ok) return failure("Too many requests. Please wait a few minutes and try again.");

  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    const token = randomToken();
    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const link = `${await getBaseUrl()}/reset-password/${token}`;
    await sendPlatformMail({
      to: user.email,
      subject: "Reset your Kydi password",
      html: `<p>Hi ${escapeHtml(user.name)},</p><p>We received a request to reset your password. This link is valid for 60 minutes:</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    }).catch((err) => console.error("[kydi] failed to send reset email", err));
  }
  // Always respond identically to avoid account enumeration.
  return success("If an account exists for that email, a reset link is on its way.");
}

const resetSchema = z
  .object({ token: z.string().min(10), password: zPassword, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match." });

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(resetSchema, formData);
  if (!parsed.success) return parsed.state;
  const { token, password } = parsed.data;

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return failure("This reset link is invalid or has expired. Request a new one.");
  }
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password) } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  await setFlash("Password updated. Sign in with your new password.");
  redirect("/login");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
