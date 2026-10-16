import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ROLE_PRESETS } from "@/lib/abilities";
import { saveCompanySettings, type SettingKey } from "@/lib/settings";
import { randomToken } from "@/lib/auth/tokens";
import { slugify } from "@/lib/utils";

type Tx = Prisma.TransactionClient;

export type NewCompanyInput = {
  name: string;
  currency: string;
  country?: string | null;
  time_zone?: string;
  date_format?: string;
  locale?: string;
  fiscal_year?: string;
};

export const DEFAULT_PAYMENT_METHODS = ["Cash", "Check", "Credit Card", "Bank Transfer"];
export const DEFAULT_UNITS = ["box", "cm", "dz", "ft", "g", "in", "kg", "km", "lb", "mg", "pc"];

async function uniqueSlug(tx: Tx, name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await tx.company.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

/** Spec §3.1 "On create": owner + membership, role presets, payment methods, units, settings sheet. */
export async function createCompanyForUser(userId: number, input: NewCompanyInput, tx?: Tx) {
  const run = async (t: Tx) => {
    const company = await t.company.create({
      data: {
        name: input.name,
        slug: await uniqueSlug(t, input.name),
        uniqueHash: randomToken(9),
        ownerId: userId,
        country: input.country ?? null,
      },
    });
    let ownerRoleId = 0;
    for (const preset of ROLE_PRESETS) {
      const role = await t.role.create({
        data: { companyId: company.id, name: preset.name, title: preset.title, abilities: preset.abilities, isOwner: preset.isOwner },
      });
      if (preset.isOwner) ownerRoleId = role.id;
    }
    await t.companyUser.create({ data: { companyId: company.id, userId, roleId: ownerRoleId } });
    await t.paymentMethod.createMany({ data: DEFAULT_PAYMENT_METHODS.map((name) => ({ companyId: company.id, name })) });
    await t.unit.createMany({ data: DEFAULT_UNITS.map((name) => ({ companyId: company.id, name })) });
    const settings: Partial<Record<SettingKey, string>> = { currency: input.currency };
    if (input.time_zone) settings.time_zone = input.time_zone;
    if (input.date_format) settings.date_format = input.date_format;
    if (input.locale) settings.locale = input.locale;
    if (input.fiscal_year) settings.fiscal_year = input.fiscal_year;
    await saveCompanySettings(company.id, settings, t);
    await t.user.update({ where: { id: userId }, data: { lastCompanyId: company.id } });
    return company;
  };
  return tx ? run(tx) : db.$transaction(run, { timeout: 20000 });
}

export async function companyHasFinancialData(companyId: number): Promise<boolean> {
  const [i, e, p] = await Promise.all([
    db.invoice.count({ where: { companyId } }),
    db.estimate.count({ where: { companyId } }),
    db.payment.count({ where: { companyId } }),
  ]);
  return i + e + p > 0;
}
