"use server";

import { cookies } from "next/headers";
import { secureCookies } from "@/lib/auth/cookies";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, parseForm, zPassword, type ActionState } from "@/lib/action";
import { hashPassword } from "@/lib/auth/password";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { COMPANY_COOKIE } from "@/lib/auth/context";
import { setFlash } from "@/lib/flash";

async function usableInvitation(token: string) {
  const inv = await db.invitation.findUnique({ where: { token }, include: { company: true } });
  if (!inv || inv.status !== "PENDING") return null;
  if (inv.expiresAt < new Date()) {
    await db.invitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    return null;
  }
  return inv;
}

async function joinCompany(userId: number, inv: { id: number; companyId: number; roleId: number }) {
  await db.$transaction([
    db.companyUser.upsert({
      where: { companyId_userId: { companyId: inv.companyId, userId } },
      create: { companyId: inv.companyId, userId, roleId: inv.roleId },
      update: {},
    }),
    db.invitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED" } }),
    db.user.update({ where: { id: userId }, data: { lastCompanyId: inv.companyId } }),
  ]);
  const jar = await cookies();
  jar.set(COMPANY_COOKIE, String(inv.companyId), { ...(await secureCookies()), maxAge: 60 * 60 * 24 * 365 });
}

export async function respondInvitationAction(token: string, accept: boolean): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/invitations/${token}`);
  const inv = await usableInvitation(token);
  if (!inv || inv.email !== user.email) redirect(`/invitations/${token}`);
  if (accept) {
    await joinCompany(user.id, inv);
    await setFlash(`You joined ${inv.company.name}.`);
    redirect("/dashboard");
  }
  await db.invitation.update({ where: { id: inv.id }, data: { status: "DECLINED" } });
  await setFlash("Invitation declined.", "info");
  redirect("/");
}

const registerSchema = z
  .object({ token: z.string(), name: z.string().trim().min(2, "Enter your name.").max(100), password: zPassword, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match." });

export async function registerFromInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(registerSchema, formData);
  if (!parsed.success) return parsed.state;
  const inv = await usableInvitation(parsed.data.token);
  if (!inv) return failure("This invitation is no longer valid.");
  if (await db.user.findUnique({ where: { email: inv.email } })) return failure("An account already exists for this email. Sign in to accept.");
  const user = await db.user.create({ data: { name: parsed.data.name, email: inv.email, passwordHash: await hashPassword(parsed.data.password) } });
  await joinCompany(user.id, inv);
  await createSession(user.id);
  await setFlash(`Welcome! You joined ${inv.company.name}.`);
  redirect("/dashboard");
}
