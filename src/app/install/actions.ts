"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, parseForm, zEmail, zPassword, type ActionState } from "@/lib/action";
import { hashPassword } from "@/lib/auth/password";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { COMPANY_COOKIE } from "@/lib/auth/context";
import { createCompanyForUser } from "@/lib/companies";
import { isCurrency, isTimezone } from "@/lib/intl-data";
import { setFlash } from "@/lib/flash";

const adminSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name.").max(100),
    email: zEmail,
    password: zPassword,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match." });

export async function installAdminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(adminSchema, formData);
  if (!parsed.success) return parsed.state;
  const { name, email, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  const created = await db.$transaction(async (tx) => {
    if ((await tx.user.count()) > 0) return null;
    return tx.user.create({ data: { name, email, passwordHash, role: "SUPER_ADMIN" } });
  });
  if (!created) return failure("Halyard is already installed. Sign in instead.");
  await createSession(created.id);
  redirect("/install/company");
}

const companySchema = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(120),
  currency: z.string().refine(isCurrency, "Choose a valid currency."),
  country: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  time_zone: z.string().refine(isTimezone, "Choose a valid time zone."),
  date_format: z.string().min(1),
  locale: z.string().min(2),
  fiscal_year: z.string().regex(/^\d{1,2}-\d{1,2}$/, "Choose a fiscal year."),
});

export async function createCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const parsed = parseForm(companySchema, formData);
  if (!parsed.success) return parsed.state;

  const memberships = await db.companyUser.count({ where: { userId: user.id } });
  if (memberships > 0) {
    const owns = await db.company.count({ where: { ownerId: user.id } });
    if (!owns && user.role !== "SUPER_ADMIN") return failure("Only company owners can create another company.");
  }

  if (await db.company.findUnique({ where: { name: parsed.data.name } })) {
    return failure("A company with this name already exists.", { name: ["A company with this name already exists."] });
  }
  const company = await createCompanyForUser(user.id, parsed.data);
  const jar = await cookies();
  jar.set(COMPANY_COOKIE, String(company.id), { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  await setFlash(memberships === 0 ? `Welcome to Halyard! ${company.name} is ready.` : `${company.name} created.`);
  redirect("/dashboard");
}
