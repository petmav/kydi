import { cookies, headers } from "next/headers";
import type { z } from "zod";
import { db } from "@/lib/db";
import { sha256, unsignValue } from "@/lib/auth/tokens";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { ALL_ABILITIES, type Ability } from "@/lib/abilities";
import { getCompanySettings } from "@/lib/settings";
import { plain } from "@/lib/money";
import type { CompanyContext } from "@/lib/auth/context";

/** REST API plumbing (spec §9.1): bearer token or session cookie, `company` header, JSON envelopes. */

export class ApiError extends Error {
  constructor(public status: number, message: string, public errors?: Record<string, string[] | undefined>) {
    super(message);
  }
}

/** Authenticates the caller (bearer token or session cookie) without resolving a company. */
export async function apiUser() {
  const h = await headers();
  let userId: number | null = null;
  const auth = h.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    const t = await db.apiToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!t || (t.expiresAt && t.expiresAt < new Date())) throw new ApiError(401, "Unauthenticated.");
    userId = t.userId;
    await db.apiToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  } else {
    const raw = unsignValue((await cookies()).get(SESSION_COOKIE)?.value);
    const s = raw ? await db.session.findUnique({ where: { tokenHash: sha256(raw) } }) : null;
    if (!s || s.expiresAt < new Date()) throw new ApiError(401, "Unauthenticated.");
    userId = s.userId;
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(401, "Unauthenticated.");
  return user;
}

export async function apiContext(): Promise<CompanyContext> {
  const h = await headers();
  const user = await apiUser();
  const memberships = await db.companyUser.findMany({ where: { userId: user.id }, include: { company: true, role: true }, orderBy: { createdAt: "asc" } });
  if (!memberships.length) throw new ApiError(403, "No company membership.");
  const wanted = Number(h.get("company"));
  const m = memberships.find((x) => x.companyId === wanted) ?? memberships[0];
  const isOwner = m.company.ownerId === user.id;
  const abilities = new Set<string>(isOwner ? ALL_ABILITIES : m.role.abilities);
  return {
    user,
    company: m.company,
    companyId: m.companyId,
    role: m.role,
    memberships,
    abilities,
    settings: await getCompanySettings(m.companyId),
    isOwner,
    isSuperAdmin: user.role === "SUPER_ADMIN",
    can: (a: Ability) => abilities.has(a),
  };
}

export function need(ctx: CompanyContext, ...abilities: Ability[]) {
  if (!abilities.every((a) => ctx.can(a))) throw new ApiError(403, "This action is unauthorized.");
}

export function ok(data: unknown, status = 200) {
  return Response.json(plain(data), { status });
}

export function fail(e: unknown) {
  if (e instanceof ApiError) return Response.json({ message: e.message, ...(e.errors ? { errors: e.errors } : {}) }, { status: e.status });
  if (e instanceof SyntaxError) return Response.json({ message: "Malformed JSON body." }, { status: 400 });
  console.error("[kydi:api]", e);
  return Response.json({ message: "Server error." }, { status: 500 });
}

export function listParams(url: URL, sortable: string[], defaultSort: string, defaultDir: "asc" | "desc" = "desc") {
  const q = (k: string) => url.searchParams.get(k) ?? "";
  const all = q("limit") === "all";
  const limit = all ? undefined : Math.min(100, Math.max(1, Number(q("limit")) || 10));
  const page = Math.max(1, Number(q("page")) || 1);
  const field = sortable.includes(q("orderByField")) ? q("orderByField") : defaultSort;
  const dir = q("orderBy") === "asc" || q("orderBy") === "desc" ? (q("orderBy") as "asc" | "desc") : defaultDir;
  return { q, limit, page, skip: limit ? (page - 1) * limit : undefined, orderBy: { [field]: dir }, terms: q("search").split(/\s+/).filter(Boolean) };
}

export function envelope(rows: unknown[], total: number, unfiltered: number, resource: string, p: { page: number; limit?: number }) {
  const per = p.limit ?? total;
  return { data: rows, meta: { current_page: p.page, last_page: per ? Math.max(1, Math.ceil(total / per)) : 1, per_page: per, total, [`${resource}_total_count`]: unfiltered } };
}

export function cfFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const list = (body.customFields ?? body.custom_fields) as { id: number; value: unknown }[] | undefined;
  if (Array.isArray(list)) for (const f of list) out[`cf_${f.id}`] = f.value;
  return out;
}

export function needOwner(ctx: CompanyContext) {
  if (!ctx.isOwner) throw new ApiError(403, "Only the company owner can do this.");
}

/** Unwraps a service result or throws the matching API error (422 by default). */
export function unwrap<T>(r: { ok: true; id: T } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined>; status?: number }): T {
  if (!r.ok) throw new ApiError(r.status ?? 422, r.error, r.fieldErrors);
  return r.id;
}

/** Parses a request body with a zod schema or throws a 422 with field errors. */
export function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) {
    const errors: Record<string, string[]> = {};
    for (const i of r.error.issues) (errors[i.path.join(".") || "body"] ??= []).push(i.message);
    throw new ApiError(422, "The given data was invalid.", errors);
  }
  return r.data;
}

export const idList = (body: Record<string, unknown>, key = "ids") => (Array.isArray(body[key]) ? (body[key] as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);

/** Router signature for the /api/v1 extension modules; returns null when the path is not theirs. */
export type V1Request = { ctx: CompanyContext; req: Request; url: URL; seg: string[]; method: string; body: Record<string, unknown> };
export type V1Router = (r: V1Request) => Promise<Response | null>;
