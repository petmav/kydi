import { z } from "zod";
import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import type { FieldErrors } from "@/lib/action";
import { zEmail, zOptionalString, zPassword } from "@/lib/action";
import { hashPassword } from "@/lib/auth/password";
import { randomToken } from "@/lib/auth/tokens";
import { withDependencies } from "@/lib/abilities";
import { getBaseUrl } from "@/lib/url";
import { sendCompanyMail } from "@/server/mailer";

/** Members, invitations, roles and ownership (spec §2.4, §2.5, §3.3, §3.4, §5.10). Owner-only; callers check. */

export type TeamResult = { ok: true; id: number } | { ok: false; error: string; fieldErrors?: FieldErrors; status?: number };

const fail = (error: string, fieldErrors?: FieldErrors, status?: number): TeamResult => ({ ok: false, error, fieldErrors, status });
const PRESET_NAMES = ["owner", "manager", "read-only"];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function roleInCompany(companyId: number, roleId: number) {
  return db.role.findFirst({ where: { id: roleId, companyId } });
}

export const inviteSchema = z.object({ email: zEmail, roleId: z.coerce.number().int().positive("Choose a role.") });

export async function inviteMember(ctx: CompanyContext, input: z.infer<typeof inviteSchema>): Promise<TeamResult> {
  const role = await roleInCompany(ctx.companyId, input.roleId);
  if (!role) return fail("Choose a valid role.", { roleId: ["Choose a valid role."] });
  if (role.isOwner) return fail("The owner role cannot be granted by invitation.", { roleId: ["Choose another role."] });
  if (await db.companyUser.findFirst({ where: { companyId: ctx.companyId, user: { email: input.email } } })) {
    return fail("This person is already a member.", { email: ["Already a member of this company."] });
  }
  if (await db.invitation.findFirst({ where: { companyId: ctx.companyId, email: input.email, status: "PENDING", expiresAt: { gt: new Date() } } })) {
    return fail("An invitation is already pending for this email.", { email: ["Invitation already pending."] });
  }
  const token = randomToken(48);
  const inv = await db.invitation.create({
    data: { companyId: ctx.companyId, email: input.email, roleId: role.id, token, invitedById: ctx.user.id, expiresAt: new Date(Date.now() + 7 * 86400000) },
  });
  const base = await getBaseUrl();
  const link = `${base}/invitations/${token}`;
  await sendCompanyMail(ctx.companyId, {
    to: input.email,
    subject: `Invitation to join ${ctx.company.name} on Kydi`,
    html:
      `<p>${esc(ctx.user.name)} invited you to join <strong>${esc(ctx.company.name)}</strong> on Kydi as ${esc(role.title)}.</p>` +
      `<p><a href="${link}">Accept the invitation</a></p>` +
      `<p>If you do not want to join, <a href="${link}?decline=1">decline the invitation</a>. The invitation expires in 7 days.</p>`,
  }).catch((e) => console.error("[kydi] invitation email failed", e));
  return { ok: true, id: inv.id };
}

export async function cancelInvitation(ctx: CompanyContext, id: number): Promise<TeamResult> {
  const r = await db.invitation.deleteMany({ where: { id, companyId: ctx.companyId, status: "PENDING" } });
  return r.count ? { ok: true, id } : fail("Invitation not found.", undefined, 404);
}

/** Pending, unexpired invitations addressed to a user (spec §5.10: shown in-app and on the no-company screen). */
export async function pendingInvitationsFor(email: string) {
  return db.invitation.findMany({
    where: { email: email.toLowerCase(), status: "PENDING", expiresAt: { gt: new Date() } },
    include: { company: { select: { id: true, name: true } }, role: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Accept or decline an invitation as the signed-in addressee. */
export async function respondToInvitation(user: { id: number; email: string }, token: string, accept: boolean): Promise<TeamResult> {
  const inv = await db.invitation.findUnique({ where: { token } });
  if (!inv || inv.status !== "PENDING") return fail("This invitation is no longer valid.", undefined, 404);
  if (inv.expiresAt < new Date()) {
    await db.invitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    return fail("This invitation has expired.", undefined, 410);
  }
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) return fail("This invitation is addressed to another account.", undefined, 403);
  if (!accept) {
    await db.invitation.update({ where: { id: inv.id }, data: { status: "DECLINED" } });
    return { ok: true, id: inv.companyId };
  }
  await db.$transaction([
    db.companyUser.upsert({
      where: { companyId_userId: { companyId: inv.companyId, userId: user.id } },
      create: { companyId: inv.companyId, userId: user.id, roleId: inv.roleId },
      update: {},
    }),
    db.invitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED" } }),
    db.user.update({ where: { id: user.id }, data: { lastCompanyId: inv.companyId } }),
  ]);
  return { ok: true, id: inv.companyId };
}

export const memberCreateSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(100),
  email: zEmail,
  phone: zOptionalString,
  password: zPassword,
  roleId: z.coerce.number().int().positive("Choose a role."),
});

export async function addMember(ctx: CompanyContext, input: z.infer<typeof memberCreateSchema>): Promise<TeamResult> {
  const role = await roleInCompany(ctx.companyId, input.roleId);
  if (!role) return fail("Choose a valid role.", { roleId: ["Choose a valid role."] });
  if (role.isOwner) return fail("Only one owner per company. Pick another role.", { roleId: ["The owner role is reserved."] });
  if (await db.user.findUnique({ where: { email: input.email } })) return fail("An account with this email already exists. Invite them instead.", { email: ["Email already registered."] });
  const passwordHash = await hashPassword(input.password);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { name: input.name, email: input.email, phone: input.phone ?? null, passwordHash, lastCompanyId: ctx.companyId } });
    await tx.companyUser.create({ data: { companyId: ctx.companyId, userId: u.id, roleId: role.id } });
    return u;
  });
  return { ok: true, id: user.id };
}

export const memberUpdateSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(100).optional(),
  email: zEmail.optional(),
  phone: zOptionalString,
  password: z.union([zPassword, z.literal("")]).optional(),
  roleId: z.coerce.number().int().positive().optional(),
});

/** Edit a member's account fields and role in the active company (blank password = keep). */
export async function updateMember(ctx: CompanyContext, userId: number, input: z.infer<typeof memberUpdateSchema>): Promise<TeamResult> {
  const membership = await db.companyUser.findUnique({ where: { companyId_userId: { companyId: ctx.companyId, userId } }, include: { user: true } });
  if (!membership) return fail("Member not found.", undefined, 404);
  if (input.email && input.email !== membership.user.email && (await db.user.findUnique({ where: { email: input.email } }))) {
    return fail("That email is already in use.", { email: ["That email is already in use."] });
  }
  if (input.roleId && input.roleId !== membership.roleId) {
    if (userId === ctx.company.ownerId) return fail("The owner's role cannot be changed. Transfer ownership first.", { roleId: ["Owner role is fixed."] });
    const role = await roleInCompany(ctx.companyId, input.roleId);
    if (!role) return fail("Choose a valid role.", { roleId: ["Choose a valid role."] });
    if (role.isOwner) return fail("Only one owner per company. Pick another role.", { roleId: ["The owner role is reserved."] });
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      },
    });
    if (input.roleId) await tx.companyUser.update({ where: { id: membership.id }, data: { roleId: input.roleId } });
  });
  return { ok: true, id: userId };
}

/** Removes members (spec §4.17): accounts that belonged only to this company are deleted. Owner and self are refused. */
export async function removeMembers(ctx: CompanyContext, userIds: number[]): Promise<{ removed: number; refused: number[] }> {
  let removed = 0;
  const refused: number[] = [];
  for (const userId of userIds) {
    if (userId === ctx.user.id || userId === ctx.company.ownerId) {
      refused.push(userId);
      continue;
    }
    const user = await db.user.findUnique({ where: { id: userId }, include: { _count: { select: { memberships: true } } } });
    const membership = user ? await db.companyUser.findUnique({ where: { companyId_userId: { companyId: ctx.companyId, userId } } }) : null;
    if (!user || !membership) {
      refused.push(userId);
      continue;
    }
    await db.$transaction(async (tx) => {
      await tx.companyUser.delete({ where: { id: membership.id } });
      if (user._count.memberships <= 1 && user.role !== "SUPER_ADMIN" && !(await tx.company.count({ where: { ownerId: userId } }))) {
        await tx.user.delete({ where: { id: userId } });
      }
    });
    removed++;
  }
  return { removed, refused };
}

export const roleSchema = z.object({
  title: z.string().trim().min(2, "Enter a role name.").max(60),
  abilities: z.array(z.string()).default([]),
});

export async function saveRole(ctx: CompanyContext, id: number | null, input: z.infer<typeof roleSchema>): Promise<TeamResult> {
  const abilities = withDependencies(input.abilities);
  if (!abilities.length) return fail("Select at least one ability.", { abilities: ["Select at least one ability."] });
  const name = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (await db.role.findFirst({ where: { companyId: ctx.companyId, name, NOT: id ? { id } : undefined } })) {
    return fail("A role with this name already exists.", { title: ["Name already in use."] });
  }
  if (id) {
    const role = await db.role.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!role) return fail("Role not found.", undefined, 404);
    if (role.isOwner || PRESET_NAMES.includes(role.name)) return fail("Preset roles cannot be edited.", undefined, 403);
    await db.role.update({ where: { id }, data: { title: input.title, name, abilities } });
    return { ok: true, id };
  }
  const role = await db.role.create({ data: { companyId: ctx.companyId, title: input.title, name, abilities } });
  return { ok: true, id: role.id };
}

export async function deleteRole(ctx: CompanyContext, id: number): Promise<TeamResult> {
  const role = await db.role.findFirst({ where: { id, companyId: ctx.companyId }, include: { _count: { select: { members: true } } } });
  if (!role) return fail("Role not found.", undefined, 404);
  if (role.isOwner || PRESET_NAMES.includes(role.name)) return fail("Preset roles cannot be deleted.");
  if (role._count.members > 0) return fail("This role is assigned to members and cannot be deleted.");
  await db.invitation.deleteMany({ where: { roleId: id, status: "PENDING" } });
  await db.role.delete({ where: { id } });
  return { ok: true, id };
}

/**
 * Transfer ownership (spec §2.5): the chosen member becomes owner and gets the owner role; the previous
 * owner keeps their membership with the Manager preset role (one owner-role holder per company).
 */
export async function transferOwnership(ctx: CompanyContext, userId: number): Promise<TeamResult> {
  if (!ctx.isOwner) return fail("Only the company owner can transfer ownership.", undefined, 403);
  if (userId === ctx.user.id) return fail("You already own this company.", { userId: ["Choose another member."] });
  return assignOwner(ctx.companyId, userId);
}

/**
 * Makes `userId` (an existing member) the owner of the company: owner role for them, Manager preset for the
 * previous owner, who keeps the membership. Used by the owner screen and by the platform administrator.
 */
export async function assignOwner(companyId: number, userId: number): Promise<TeamResult> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { ownerId: true } });
  if (!company) return fail("Company not found.", undefined, 404);
  if (company.ownerId === userId) return { ok: true, id: userId };
  const target = await db.companyUser.findUnique({ where: { companyId_userId: { companyId, userId } } });
  if (!target) return fail("Choose a member of this company.", { userId: ["Not a member of this company."] }, 422);
  const roles = await db.role.findMany({ where: { companyId, name: { in: ["owner", "manager"] } } });
  const ownerRole = roles.find((r) => r.isOwner || r.name === "owner");
  const managerRole = roles.find((r) => r.name === "manager");
  if (!ownerRole) return fail("The owner role is missing for this company.");
  await db.$transaction(async (tx) => {
    await tx.company.update({ where: { id: companyId }, data: { ownerId: userId } });
    await tx.companyUser.update({ where: { id: target.id }, data: { roleId: ownerRole.id } });
    if (managerRole) {
      await tx.companyUser.updateMany({ where: { companyId, userId: company.ownerId }, data: { roleId: managerRole.id } });
    }
  });
  return { ok: true, id: userId };
}
