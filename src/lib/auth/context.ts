import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { ALL_ABILITIES, type Ability } from "@/lib/abilities";

export const COMPANY_COOKIE = "halyard_company";

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export type CompanyContext = Awaited<ReturnType<typeof loadCompanyContext>>;

async function loadCompanyContext() {
  const user = await requireUser();
  const memberships = await db.companyUser.findMany({
    where: { userId: user.id },
    include: { company: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) redirect("/install/company");

  const jar = await cookies();
  const preferred = jar.get(COMPANY_COOKIE)?.value ?? user.lastCompanyId ?? undefined;
  const membership = memberships.find((m) => m.companyId === preferred) ?? memberships[0];
  const abilities = new Set<string>(user.isSuperAdmin ? ALL_ABILITIES : membership.role.abilities);

  return {
    user,
    company: membership.company,
    companyId: membership.companyId,
    role: membership.role,
    memberships,
    abilities,
    can: (ability: Ability) => abilities.has(ability),
  };
}

/** Current user + active company + abilities. Redirects when unauthenticated. Cached per request. */
export const getCompanyContext = cache(loadCompanyContext);

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** For server actions / route handlers: throws ForbiddenError if the ability is missing. */
export async function requireAbility(ability: Ability): Promise<CompanyContext> {
  const ctx = await getCompanyContext();
  if (!ctx.can(ability)) throw new ForbiddenError();
  return ctx;
}
