"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, guard, parseForm, success, zEmail, zOptionalString, zPassword, type ActionState } from "@/lib/action";
import { requireOwner } from "@/lib/auth/context";
import { hashPassword } from "@/lib/auth/password";
import { randomToken } from "@/lib/auth/tokens";
import { sendMail } from "@/lib/mail";
import { getBaseUrl } from "@/lib/url";

const zId = z.coerce.number().int().positive();

async function roleInCompany(companyId: number, roleId: number) {
  return db.role.findFirst({ where: { id: roleId, companyId } });
}

const inviteSchema = z.object({ email: zEmail, roleId: zId });

export async function inviteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const parsed = parseForm(inviteSchema, formData);
    if (!parsed.success) return parsed.state;
    const { email, roleId } = parsed.data;
    if (!(await roleInCompany(ctx.companyId, roleId))) return failure("Choose a valid role.", { roleId: ["Choose a valid role."] });
    const existingMember = await db.companyUser.findFirst({ where: { companyId: ctx.companyId, user: { email } } });
    if (existingMember) return failure("This person is already a member.", { email: ["Already a member of this company."] });
    const pending = await db.invitation.findFirst({ where: { companyId: ctx.companyId, email, status: "PENDING", expiresAt: { gt: new Date() } } });
    if (pending) return failure("An invitation is already pending for this email.", { email: ["Invitation already pending."] });
    const token = randomToken(48);
    await db.invitation.create({
      data: { companyId: ctx.companyId, email, roleId, token, invitedById: ctx.user.id, expiresAt: new Date(Date.now() + 7 * 86400000) },
    });
    const link = `${await getBaseUrl()}/invitations/${token}`;
    await sendMail({
      to: email,
      subject: `You're invited to join ${ctx.company.name} on Halyard`,
      html: `<p>${ctx.user.name} invited you to join <strong>${ctx.company.name}</strong> on Halyard.</p><p><a href="${link}">Accept the invitation</a> (valid for 7 days).</p>`,
    }).catch((e) => console.error("[halyard] invitation email failed", e));
    revalidatePath("/members");
    return success(`Invitation sent to ${email}.`);
  });
}

export async function cancelInvitationAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    await db.invitation.deleteMany({ where: { id, companyId: ctx.companyId, status: "PENDING" } });
    revalidatePath("/members");
    return success("Invitation cancelled.");
  });
}

const addSchema = z
  .object({ name: z.string().trim().min(2, "Enter a name.").max(100), email: zEmail, phone: zOptionalString, password: zPassword, confirm: z.string(), roleId: zId })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match." });

export async function addMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const parsed = parseForm(addSchema, formData);
    if (!parsed.success) return parsed.state;
    const { name, email, phone, password, roleId } = parsed.data;
    if (!(await roleInCompany(ctx.companyId, roleId))) return failure("Choose a valid role.", { roleId: ["Choose a valid role."] });
    if (await db.user.findUnique({ where: { email } })) {
      return failure("An account with this email already exists. Invite them instead.", { email: ["Email already registered — use Invite member."] });
    }
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name, email, phone: phone ?? null, passwordHash, lastCompanyId: ctx.companyId } });
      await tx.companyUser.create({ data: { companyId: ctx.companyId, userId: user.id, roleId } });
    });
    revalidatePath("/members");
    return success(`${name} was added.`);
  });
}

const editSchema = z.object({ userId: zId, roleId: zId });

export async function updateMemberRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const parsed = parseForm(editSchema, formData);
    if (!parsed.success) return parsed.state;
    const { userId, roleId } = parsed.data;
    if (userId === ctx.company.ownerId) return failure("The owner's role cannot be changed.");
    const role = await roleInCompany(ctx.companyId, roleId);
    if (!role) return failure("Choose a valid role.", { roleId: ["Choose a valid role."] });
    if (role.isOwner) return failure("Only one owner per company. Pick another role.", { roleId: ["The owner role is reserved."] });
    await db.companyUser.update({ where: { companyId_userId: { companyId: ctx.companyId, userId } }, data: { roleId } });
    revalidatePath("/members");
    return success("Member updated.");
  });
}

export async function removeMemberAction(userId: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    if (userId === ctx.user.id) return failure("You cannot remove yourself.");
    if (userId === ctx.company.ownerId) return failure("The company owner cannot be removed.");
    const user = await db.user.findUnique({ where: { id: userId }, include: { _count: { select: { memberships: true } } } });
    if (!user) return failure("Member not found.");
    await db.$transaction(async (tx) => {
      await tx.companyUser.delete({ where: { companyId_userId: { companyId: ctx.companyId, userId } } });
      // Accounts that belonged only to this company are deleted (spec §5.10); others keep their other memberships.
      if (user._count.memberships <= 1 && user.role !== "SUPER_ADMIN") {
        const owns = await tx.company.count({ where: { ownerId: userId } });
        if (!owns) await tx.user.delete({ where: { id: userId } });
      }
    });
    revalidatePath("/members");
    return success(`${user.name} was removed.`);
  });
}
