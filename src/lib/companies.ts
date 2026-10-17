import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getRolePresets } from "@/lib/role-presets";
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
  const presets = await getRolePresets();
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
    for (const preset of presets) {
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

/**
 * Deletes a company and everything it owns (spec §3.1 "On delete"). Documents go first because their
 * restricting foreign keys to reference data are checked before the company-level cascade reaches them.
 */
export async function deleteCompany(companyId: number) {
  await db.$transaction(
    async (tx) => {
      await tx.billSettlement.deleteMany({ where: { bill: { companyId } } });
      await tx.supplierPayment.deleteMany({ where: { companyId, type: "REFUND" } });
      await tx.supplierPayment.deleteMany({ where: { companyId } });
      await tx.bill.deleteMany({ where: { companyId, type: "SUPPLIER_CREDIT" } });
      await tx.bill.deleteMany({ where: { companyId } });
      await tx.recurringCost.deleteMany({ where: { companyId } });
      await tx.supplier.deleteMany({ where: { companyId } });
      // Rows whose foreign keys restrict deletion of reference data (tax types, units, categories, roles).
      await tx.paymentAllocation.deleteMany({ where: { payment: { companyId } } });
      await tx.payment.deleteMany({ where: { companyId } });
      await tx.invoice.deleteMany({ where: { companyId } });
      await tx.estimate.deleteMany({ where: { companyId } });
      await tx.recurringInvoice.deleteMany({ where: { companyId } });
      await tx.expense.deleteMany({ where: { companyId } });
      await tx.item.deleteMany({ where: { companyId } });
      await tx.companyUser.deleteMany({ where: { companyId } });
      await tx.company.delete({ where: { id: companyId } });
    },
    { timeout: 60000 },
  );
}
