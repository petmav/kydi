"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { COMPANY_COOKIE, requireUser } from "@/lib/auth/context";
import { setFlash } from "@/lib/flash";

export async function switchCompanyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const companyId = z.string().min(1).parse(formData.get("companyId"));
  const membership = await db.companyUser.findUnique({
    where: { companyId_userId: { companyId, userId: user.id } },
    include: { company: true },
  });
  if (!membership) redirect("/dashboard");
  const jar = await cookies();
  jar.set(COMPANY_COOKIE, companyId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  await db.user.update({ where: { id: user.id }, data: { lastCompanyId: companyId } });
  await setFlash(`Switched to ${membership.company.name}.`, "info");
  redirect("/dashboard");
}
