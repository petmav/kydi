import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import { getCustomFields } from "@/lib/custom-fields";
import { currencyOptions } from "@/lib/intl-data";

export async function expenseFormData(ctx: CompanyContext) {
  const where = { companyId: ctx.companyId };
  const [categories, customers, methods, taxes, fields, suppliers] = await Promise.all([
    db.expenseCategory.findMany({ where, orderBy: { name: "asc" } }),
    db.customer.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.paymentMethod.findMany({ where, orderBy: { name: "asc" } }),
    db.taxType.findMany({ where: { ...where, transactionType: "PURCHASES" }, orderBy: { name: "asc" } }),
    getCustomFields(ctx.companyId, "Expense"),
    db.supplier.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const opt = (rows: { id: number; name: string }[]) => rows.map((r) => ({ value: String(r.id), label: r.name }));
  return {
    categories: opt(categories),
    customers: opt(customers),
    suppliers: opt(suppliers),
    methods: opt(methods),
    purchaseTaxes: opt(taxes),
    currencies: currencyOptions(),
    companyCurrency: ctx.settings.currency,
    customFields: fields.map((f) => ({ id: f.id, label: f.label, type: f.type, placeholder: f.placeholder, options: f.options, defaultAnswer: f.defaultAnswer, isRequired: f.isRequired })),
  };
}
