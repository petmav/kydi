import { z } from "zod";
import { db } from "@/lib/db";
import { zEmail, zOptionalString, zPassword, type FieldErrors } from "@/lib/action";
import { hashPassword } from "@/lib/auth/password";
import { assignOwner } from "@/server/team";
import { deleteCompany } from "@/lib/companies";

/** Platform administration (spec §5.13): companies and users across the installation. Callers check super admin. */

export type AdminResult = { ok: true; id: number } | { ok: false; error: string; fieldErrors?: FieldErrors };
const fail = (error: string, fieldErrors?: FieldErrors): AdminResult => ({ ok: false, error, fieldErrors });

export const adminCompanySchema = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(120),
  ownerId: z.coerce.number().int().positive("Choose an owner."),
  street1: zOptionalString,
  street2: zOptionalString,
  city: zOptionalString,
  state: zOptionalString,
  zip: zOptionalString,
  country: zOptionalString,
  phone: zOptionalString,
});

export async function adminUpdateCompany(id: number, input: z.infer<typeof adminCompanySchema>): Promise<AdminResult> {
  const company = await db.company.findUnique({ where: { id } });
  if (!company) return fail("Company not found.");
  if (await db.company.findFirst({ where: { name: input.name, NOT: { id } } })) {
    return fail("A company with this name already exists.", { name: ["Name already in use."] });
  }
  if (input.ownerId !== company.ownerId) {
    const r = await assignOwner(id, input.ownerId);
    if (!r.ok) return fail(r.error, { ownerId: [r.error] });
  }
  const { ownerId: _owner, ...data } = input;
  void _owner;
  await db.company.update({ where: { id }, data });
  return { ok: true, id };
}

export async function adminDeleteCompany(id: number, confirm: string): Promise<AdminResult> {
  const company = await db.company.findUnique({ where: { id } });
  if (!company) return fail("Company not found.");
  if (confirm.trim() !== company.name) return fail("Type the company name exactly to confirm.", { confirm: ["The name does not match."] });
  await deleteCompany(id);
  await db.user.updateMany({ where: { lastCompanyId: id }, data: { lastCompanyId: null } });
  return { ok: true, id };
}

const zRole = z.enum(["USER", "SUPER_ADMIN"]);

export const adminUserSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(100),
  email: zEmail,
  phone: zOptionalString,
  password: z.union([zPassword, z.literal("")]).optional(),
  role: zRole.default("USER"),
  /** company id -> role id ("" = not a member) */
  memberships: z.record(z.string(), z.string()).default({}),
});

export type AdminUserInput = z.infer<typeof adminUserSchema>;

/** Reads `membership_<companyId>` = roleId pairs from a form object. */
export function membershipsFromForm(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const m = /^membership_(\d+)$/.exec(k);
    if (m && typeof v === "string") out[m[1]] = v;
  }
  return out;
}

async function validateMemberships(userId: number | null, memberships: Record<string, string>): Promise<{ companyId: number; roleId: number | null }[] | string> {
  const rows: { companyId: number; roleId: number | null }[] = [];
  for (const [cid, rid] of Object.entries(memberships)) {
    const companyId = Number(cid);
    const roleId = rid ? Number(rid) : null;
    const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, ownerId: true } });
    if (!company) return "Unknown company.";
    const owns = userId !== null && company.ownerId === userId;
    if (roleId === null) {
      if (owns) return `${company.name}: the owner cannot be removed. Transfer ownership first.`;
      rows.push({ companyId, roleId: null });
      continue;
    }
    const role = await db.role.findFirst({ where: { id: roleId, companyId } });
    if (!role) return `${company.name}: choose a valid role.`;
    if (role.isOwner && !owns) return `${company.name}: the owner role is reserved; change the owner on the company instead.`;
    if (owns && !role.isOwner) return `${company.name}: the owner keeps the owner role. Transfer ownership first.`;
    rows.push({ companyId, roleId });
  }
  return rows;
}

export async function adminSaveUser(id: number | null, input: AdminUserInput, actorId: number): Promise<AdminResult> {
  const existing = id ? await db.user.findUnique({ where: { id } }) : null;
  if (id && !existing) return fail("User not found.");
  const clash = await db.user.findUnique({ where: { email: input.email } });
  if (clash && clash.id !== id) return fail("That email is already in use.", { email: ["That email is already in use."] });
  if (!id && !input.password) return fail("Set a password for the new user.", { password: ["Use at least 8 characters."] });
  if (id === actorId && input.role !== "SUPER_ADMIN") return fail("You cannot remove your own administrator role.", { role: ["Keep your administrator role."] });
  const rows = await validateMemberships(id, input.memberships);
  if (typeof rows === "string") return fail(rows);
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  const userId = await db.$transaction(async (tx) => {
    const data = { name: input.name, email: input.email, phone: input.phone ?? null, role: input.role, ...(passwordHash ? { passwordHash } : {}) };
    const u = id ? await tx.user.update({ where: { id }, data }) : await tx.user.create({ data: { ...data, passwordHash: passwordHash! } });
    for (const r of rows) {
      if (r.roleId === null) {
        await tx.companyUser.deleteMany({ where: { companyId: r.companyId, userId: u.id } });
      } else {
        await tx.companyUser.upsert({
          where: { companyId_userId: { companyId: r.companyId, userId: u.id } },
          create: { companyId: r.companyId, userId: u.id, roleId: r.roleId },
          update: { roleId: r.roleId },
        });
      }
    }
    return u.id;
  });
  return { ok: true, id: userId };
}

export async function adminDeleteUser(id: number, actorId: number): Promise<AdminResult> {
  if (id === actorId) return fail("You cannot delete your own account.");
  const user = await db.user.findUnique({ where: { id }, include: { _count: { select: { ownedCompanies: true } } } });
  if (!user) return fail("User not found.");
  if (user._count.ownedCompanies > 0) return fail(`${user.name} owns a company. Change the company owner first.`);
  await db.user.delete({ where: { id } });
  return { ok: true, id };
}
