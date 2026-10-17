import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ABILITY_GROUPS, ABILITY_DEPENDENCIES } from "@/lib/abilities";
import { saveCompanySettings, type SettingKey } from "@/lib/settings";
import { companyHasFinancialData, createCompanyForUser } from "@/lib/companies";
import { isCurrency } from "@/lib/intl-data";
import { deleteStoredFile, storeFile } from "@/lib/storage";
import { ApiError, envelope, idList, listParams, needOwner, ok, parseBody, unwrap, type V1Router } from "@/server/api";
import { companyProfileSchema, SETTABLE_KEYS, validateSettingsPatch } from "@/server/company-settings";
import {
  addMember,
  cancelInvitation,
  deleteRole,
  inviteMember,
  inviteSchema,
  memberCreateSchema,
  memberUpdateSchema,
  pendingInvitationsFor,
  removeMembers,
  roleSchema,
  saveRole,
  transferOwnership,
  updateMember,
} from "@/server/team";

/** /api/v1 team & company endpoints (spec §9.2: company, companies, members, company-invitations, roles, abilities). */

const words = (terms: string[], fields: string[]) => terms.map((t) => ({ OR: fields.map((f) => ({ [f]: { contains: t, mode: "insensitive" } })) }));

function memberView(m: { id: number; userId: number; createdAt: Date; role: { id: number; title: string; name: string }; user: { id: number; name: string; email: string; phone: string | null } }, ownerId: number) {
  return { id: m.user.id, name: m.user.name, email: m.user.email, phone: m.user.phone, role: { id: m.role.id, name: m.role.name, title: m.role.title }, is_owner: m.user.id === ownerId, created_at: m.createdAt };
}

const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/;

/** Decodes an image sent as a base64 data URL (spec §3.1: "also base64 data from a cropper"). */
export function decodeImageDataUrl(value: unknown, maxBytes: number): { ext: string; buffer: Buffer } | null {
  const m = typeof value === "string" ? IMAGE_DATA_URL.exec(value) : null;
  if (!m) return null;
  const buffer = Buffer.from(m[2], "base64");
  if (!buffer.length || buffer.length > maxBytes) return null;
  return { ext: m[1] === "jpeg" ? "jpg" : m[1], buffer };
}

export const teamRouter: V1Router = async ({ ctx, url, seg, method, body }) => {
  const [resource, second, third] = seg;

  if (resource === "abilities" && method === "GET") {
    return ok({ data: ABILITY_GROUPS.map((g) => ({ group: g.key, label: g.label, abilities: g.abilities.map((a) => ({ ability: a.ability, label: a.label, depends_on: ABILITY_DEPENDENCIES[a.ability] ?? [] })) })) });
  }

  if (resource === "company") {
    if (!second && (method === "PUT" || method === "PATCH")) {
      needOwner(ctx);
      const data = parseBody(companyProfileSchema, { ...body, vatId: body.vat_id ?? body.vatId, taxId: body.tax_id ?? body.taxId, street1: body.address_street_1 ?? body.street1, street2: body.address_street_2 ?? body.street2 });
      if (await db.company.findFirst({ where: { name: data.name, NOT: { id: ctx.companyId } } })) throw new ApiError(422, "A company with this name already exists.", { name: ["taken"] });
      return ok({ data: await db.company.update({ where: { id: ctx.companyId }, data }) });
    }
    if (second === "logo" && method === "POST") {
      needOwner(ctx);
      if (body.remove === true) {
        await deleteStoredFile(ctx.company.logoPath);
        await db.company.update({ where: { id: ctx.companyId }, data: { logoPath: null } });
        return ok({ success: true });
      }
      const img = decodeImageDataUrl(body.logo, 2 * 1024 * 1024);
      if (!img) throw new ApiError(422, "Send the logo as a base64 image data URL (PNG, JPG, GIF or WebP, max 2 MB).", { logo: ["invalid_image"] });
      const stored = await storeFile(`logos/${ctx.companyId}`, `logo.${img.ext}`, img.buffer);
      await deleteStoredFile(ctx.company.logoPath);
      await db.company.update({ where: { id: ctx.companyId }, data: { logoPath: stored } });
      return ok({ success: true, logo_url: `/api/files/logo/${ctx.company.uniqueHash}` });
    }
    if (second === "settings" && method === "GET") {
      needOwner(ctx);
      const wanted = url.searchParams.getAll("settings[]").concat(url.searchParams.getAll("settings"));
      const keys = wanted.length ? wanted : Object.keys(ctx.settings);
      return ok(Object.fromEntries(keys.filter((k) => k in ctx.settings).map((k) => [k, ctx.settings[k as SettingKey]])));
    }
    if (second === "settings" && method === "POST") {
      needOwner(ctx);
      const raw = (body.settings && typeof body.settings === "object" ? body.settings : body) as Record<string, unknown>;
      const { currency, ...rest } = raw;
      const v = validateSettingsPatch(rest);
      if (!v.ok) throw new ApiError(422, "The given data was invalid.", v.errors);
      if (currency !== undefined && currency !== ctx.settings.currency) {
        if (typeof currency !== "string" || !isCurrency(currency)) throw new ApiError(422, "Choose a valid currency.", { currency: ["invalid"] });
        if (await companyHasFinancialData(ctx.companyId)) throw new ApiError(422, "The currency cannot be changed once documents or payments exist.", { currency: ["currency_locked"] });
        v.values.currency = currency;
      }
      await saveCompanySettings(ctx.companyId, v.values);
      return ok({ success: true, settable_keys: SETTABLE_KEYS });
    }
    if (second === "has-transactions" && method === "GET") return ok({ has_transactions: await companyHasFinancialData(ctx.companyId) });
    if (second === "transfer-ownership" && third && method === "POST") {
      needOwner(ctx);
      unwrap(await transferOwnership(ctx, Number(third)));
      return ok({ success: true });
    }
    return null;
  }

  if (resource === "companies") {
    if (!second && method === "GET") return ok({ data: ctx.memberships.map((m) => ({ id: m.companyId, name: m.company.name, slug: m.company.slug, role: m.role.title, is_owner: m.company.ownerId === ctx.user.id })) });
    if (!second && method === "POST") {
      const ownsAny = await db.company.count({ where: { ownerId: ctx.user.id } });
      if (!ownsAny && !ctx.isSuperAdmin) throw new ApiError(403, "Only company owners can create another company.");
      const input = parseBody(z.object({ name: z.string().trim().min(2).max(120), currency: z.string().trim().toUpperCase().refine(isCurrency, "Choose a valid currency."), country: z.string().trim().min(2, "Choose a country.") }), { ...body, country: body.country ?? (body.address as Record<string, unknown> | undefined)?.country });
      if (await db.company.findFirst({ where: { name: input.name } })) throw new ApiError(422, "A company with this name already exists.", { name: ["taken"] });
      const company = await createCompanyForUser(ctx.user.id, { name: input.name, currency: input.currency, country: input.country, time_zone: ctx.settings.time_zone, date_format: ctx.settings.date_format, locale: ctx.settings.locale });
      return ok({ data: company }, 201);
    }
    if (second === "delete" && method === "POST") {
      needOwner(ctx);
      if (String(body.name ?? "").trim() !== ctx.company.name) return ok({ success: false, error: "company_name_must_match_with_given_name" });
      if (ctx.memberships.length <= 1) throw new ApiError(422, "You cannot delete your last remaining company.");
      await db.company.delete({ where: { id: ctx.companyId } });
      return ok({ success: true });
    }
    return null;
  }

  if (resource === "members") {
    needOwner(ctx);
    if (!second && method === "GET") {
      const p = listParams(url, ["createdAt"], "createdAt", "asc");
      const userWhere: Prisma.UserWhereInput = { AND: words(p.terms, ["name", "email", "phone"]) };
      if (p.q("display_name")) userWhere.name = { contains: p.q("display_name"), mode: "insensitive" };
      if (p.q("email")) userWhere.email = { contains: p.q("email"), mode: "insensitive" };
      const where: Prisma.CompanyUserWhereInput = { companyId: ctx.companyId, user: userWhere };
      const [rows, total, unfiltered] = await Promise.all([
        db.companyUser.findMany({ where, include: { user: true, role: true }, orderBy: p.orderBy, skip: p.skip, take: p.limit }),
        db.companyUser.count({ where }),
        db.companyUser.count({ where: { companyId: ctx.companyId } }),
      ]);
      return ok(envelope(rows.map((m) => memberView(m, ctx.company.ownerId)), total, unfiltered, "user", p));
    }
    if (!second && method === "POST") {
      const input = parseBody(memberCreateSchema, { ...body, roleId: body.role_id ?? body.roleId });
      const id = unwrap(await addMember(ctx, input));
      const m = await db.companyUser.findUniqueOrThrow({ where: { companyId_userId: { companyId: ctx.companyId, userId: id } }, include: { user: true, role: true } });
      return ok({ data: memberView(m, ctx.company.ownerId) }, 201);
    }
    if (second === "delete" && method === "POST") {
      const r = await removeMembers(ctx, idList(body, "users").length ? idList(body, "users") : idList(body));
      return ok({ success: r.refused.length === 0, removed: r.removed, refused: r.refused });
    }
    const userId = Number(second);
    if (!Number.isInteger(userId) || userId <= 0 || third) return null;
    if (method === "GET" || method === "PUT" || method === "PATCH") {
      if (method !== "GET") unwrap(await updateMember(ctx, userId, parseBody(memberUpdateSchema, { ...body, roleId: body.role_id ?? body.roleId })));
      const m = await db.companyUser.findUnique({ where: { companyId_userId: { companyId: ctx.companyId, userId } }, include: { user: true, role: true } });
      if (!m) throw new ApiError(404, "Not found.");
      return ok({ data: memberView(m, ctx.company.ownerId) });
    }
    if (method === "DELETE") {
      const r = await removeMembers(ctx, [userId]);
      if (!r.removed) throw new ApiError(422, "This member cannot be removed (owner, yourself or not a member).");
      return ok({ success: true });
    }
    return null;
  }

  if (resource === "company-invitations") {
    if (!second && method === "GET") {
      needOwner(ctx);
      const rows = await db.invitation.findMany({ where: { companyId: ctx.companyId, status: "PENDING", expiresAt: { gt: new Date() } }, include: { role: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" } });
      const inviters = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.invitedById) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
      return ok({ data: rows.map((r) => ({ id: r.id, email: r.email, role: r.role, status: r.status, invited_by: inviters.get(r.invitedById) ?? null, expires_at: r.expiresAt, created_at: r.createdAt })) });
    }
    if (!second && method === "POST") {
      needOwner(ctx);
      const id = unwrap(await inviteMember(ctx, parseBody(inviteSchema, { email: body.email, roleId: body.role_id ?? body.roleId })));
      return ok({ data: { id } }, 201);
    }
    if (second === "pending" && method === "GET") {
      const rows = await pendingInvitationsFor(ctx.user.email);
      return ok({ data: rows.map((r) => ({ id: r.id, token: r.token, company: r.company, role: r.role.title, expires_at: r.expiresAt })) });
    }
    const id = Number(second);
    if (Number.isInteger(id) && id > 0 && method === "DELETE") {
      needOwner(ctx);
      unwrap(await cancelInvitation(ctx, id));
      return ok({ success: true });
    }
    return null;
  }

  if (resource === "roles") {
    needOwner(ctx);
    const view = (r: { id: number; name: string; title: string; abilities: string[]; isOwner: boolean; createdAt: Date }, members?: number) => ({ id: r.id, name: r.name, title: r.title, abilities: r.abilities, is_preset: r.isOwner || ["owner", "manager", "read-only"].includes(r.name), members_count: members, created_at: r.createdAt });
    if (!second && method === "GET") {
      const roles = await db.role.findMany({ where: { companyId: ctx.companyId }, include: { _count: { select: { members: true } } }, orderBy: { createdAt: "asc" } });
      return ok({ data: roles.map((r) => view(r, r._count.members)) });
    }
    const input = () => parseBody(roleSchema, { title: body.title ?? body.name, abilities: body.abilities });
    if (!second && method === "POST") {
      const id = unwrap(await saveRole(ctx, null, input()));
      return ok({ data: view(await db.role.findUniqueOrThrow({ where: { id } })) }, 201);
    }
    const id = Number(second);
    if (!Number.isInteger(id) || id <= 0 || third) return null;
    if (method === "GET") {
      const r = await db.role.findFirst({ where: { id, companyId: ctx.companyId }, include: { _count: { select: { members: true } } } });
      if (!r) throw new ApiError(404, "Not found.");
      return ok({ data: view(r, r._count.members) });
    }
    if (method === "PUT" || method === "PATCH") {
      unwrap(await saveRole(ctx, id, input()));
      return ok({ data: view(await db.role.findUniqueOrThrow({ where: { id } })) });
    }
    if (method === "DELETE") {
      const r = await deleteRole(ctx, id);
      return ok(r.ok ? { success: true } : { success: false, error: r.error });
    }
    return null;
  }

  if (resource === "me") {
    const user = ctx.user;
    if (!second && method === "GET") return ok({ data: user });
    if (!second && (method === "PUT" || method === "PATCH")) {
      const input = parseBody(memberUpdateSchema.pick({ name: true, email: true, phone: true, password: true }), body);
      if (input.email && input.email !== ctx.user.email && (await db.user.findUnique({ where: { email: input.email } }))) throw new ApiError(422, "That email is already in use.", { email: ["taken"] });
      const { hashPassword } = await import("@/lib/auth/password");
      const updated = await db.user.update({
        where: { id: ctx.user.id },
        data: { ...(input.name ? { name: input.name } : {}), ...(input.email ? { email: input.email } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}), ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}) },
        omit: { passwordHash: true },
      });
      return ok({ data: updated });
    }
    if (second === "settings" && method === "GET") return ok({ data: ctx.user.settings ?? {} });
    if (second === "settings" && (method === "PUT" || method === "POST")) {
      const allowed = ["language", "default_invoice_template", "default_estimate_template", "timezone"];
      const raw = (body.settings && typeof body.settings === "object" ? body.settings : body) as Record<string, unknown>;
      const patch = Object.fromEntries(Object.entries(raw).filter(([k, v]) => allowed.includes(k) && typeof v === "string"));
      const settings = { ...((ctx.user.settings as Record<string, string>) ?? {}), ...(patch as Record<string, string>) };
      await db.user.update({ where: { id: ctx.user.id }, data: { settings } });
      return ok({ data: settings });
    }
    return null;
  }

  return null;
};

