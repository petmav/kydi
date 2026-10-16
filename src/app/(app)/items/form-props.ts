import { db } from "@/lib/db";
import { getCustomFields } from "@/lib/custom-fields";
import { currencySymbol } from "@/lib/money";
import type { CompanyContext } from "@/lib/auth/context";

export async function itemFormProps(ctx: CompanyContext) {
  const [units, taxes, fields] = await Promise.all([
    db.unit.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    db.taxType.findMany({ where: { companyId: ctx.companyId, transactionType: "SALES" }, orderBy: { name: "asc" } }),
    getCustomFields(ctx.companyId, "Item"),
  ]);
  return {
    units: units.map((u) => ({ value: String(u.id), label: u.name })),
    taxes: taxes.map((t) => ({ value: String(t.id), label: t.calculationType === "PERCENTAGE" ? `${t.name} (${t.percent}%)` : t.name })),
    showTaxes: ctx.settings.tax_per_item === "YES",
    currencySymbol: currencySymbol(ctx.settings.currency, ctx.settings.locale),
    customFields: fields.map((f) => ({ id: f.id, label: f.label, type: f.type, placeholder: f.placeholder, options: f.options, defaultAnswer: f.defaultAnswer, isRequired: f.isRequired })),
  };
}
