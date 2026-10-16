import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { ALL_ABILITIES, type Ability } from "@/lib/abilities";
import { getCompanySettings } from "@/lib/settings";

export const COMPANY_COOKIE = "halyard_company";

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

async function loadCompanyContext() {
  const user = await requireUser();
  const memberships = await db.companyUser.findMany({
    where: { userId: user.id },
    include: { company: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) redirect("/install/company");

  const jar = await cookies();
  const preferred = Number(jar.get(COMPANY_COOKIE)?.value ?? user.lastCompanyId ?? 0);
  const membership = memberships.find((m) => m.companyId === preferred) ?? memberships[0];
  const isOwner = membership.company.ownerId === user.id;
  const abilities = new Set<string>(isOwner ? ALL_ABILITIES : membership.role.abilities);
  const settings = await getCompanySettings(membership.companyId);

  return {
    user,
    company: membership.company,
    companyId: membership.companyId,
    role: membership.role,
    memberships,
    abilities,
    settings,
    isOwner,
    isSuperAdmin: user.role === "SUPER_ADMIN",
    can: (ability: Ability) => abilities.has(ability),
  };
}

export type CompanyContext = Awaited<ReturnType<typeof loadCompanyContext>>;

/** Current user + active company + abilities + settings. Redirects when unauthenticated. Cached per request. */
export const getCompanyContext = cache(loadCompanyContext);

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throws ForbiddenError unless the active role holds every listed ability. */
export async function requireAbility(...abilities: Ability[]): Promise<CompanyContext> {
  const ctx = await getCompanyContext();
  if (!abilities.every((a) => ctx.can(a))) throw new ForbiddenError();
  return ctx;
}

/** Owner-only powers (spec §3.4): company profile, settings, members, roles. */
export async function requireOwner(): Promise<CompanyContext> {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) throw new ForbiddenError("Only the company owner can do this.");
  return ctx;
}

/** Parses a numeric route id or 404s. */
export function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return id;
}
