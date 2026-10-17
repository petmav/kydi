"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, parseForm, success, zEmail, zPassword, type ActionState } from "@/lib/action";
import { hashPassword, verifyPasswordOrDummy } from "@/lib/auth/password";
import { checkPasswordPolicy } from "@/lib/auth/password-policy";
import { clientIp } from "@/lib/auth/cookies";
import { createSession, destroySession } from "@/lib/auth/session";
import { randomToken, sha256 } from "@/lib/auth/tokens";
import { clearCredentialFailures, rateLimit, throttleCredentials } from "@/lib/rate-limit";
import { sendPlatformMail } from "@/server/mailer";
import { getBaseUrl, safeNext } from "@/lib/url";
import { setFlash } from "@/lib/flash";

const loginSchema = z.object({
  email: zEmail,
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) return parsed.state;
  const { email, password, next } = parsed.data;

  const limit = throttleCredentials("login", await clientIp(), email);
  if (!limit.ok) {
    return failure(`Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfterMs / 60000)} minute(s).`);
  }

  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  const valid = await verifyPasswordOrDummy(user?.passwordHash, password);
  if (!user || !valid) {
    return failure("Incorrect email or password.", { password: ["Incorrect email or password."] });
  }
  clearCredentialFailures("login", email);
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

  const ipLimit = rateLimit(`forgot:ip:${await clientIp()}`, 5, 15 * 60 * 1000);
  const accountLimit = rateLimit(`forgot:acct:${email}`, 3, 60 * 60 * 1000);
  if (!ipLimit.ok) return failure("Too many requests. Please wait a few minutes and try again.");
  // Over the per-account budget: answer exactly like a normal request, but send nothing.
  if (!accountLimit.ok) return success("If an account exists for that email, a reset link is on its way.");

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

  const invalid = "This reset link is invalid or has expired. Request a new one.";
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: { select: { email: true, name: true } } } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) return failure(invalid);
  const weak = checkPasswordPolicy(password, record.user);
  if (weak) return failure(weak, { password: [weak] });
  const passwordHash = await hashPassword(password);
  const done = await db.$transaction(async (tx) => {
    // Single use even under concurrent submissions: only the request that flips usedAt proceeds.
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } });
    await tx.session.deleteMany({ where: { userId: record.userId } });
    await tx.apiToken.deleteMany({ where: { userId: record.userId } });
    return true;
  });
  if (!done) return failure(invalid);
  await setFlash("Password updated. Sign in with your new password.");
  redirect("/login");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
