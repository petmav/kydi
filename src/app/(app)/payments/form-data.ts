import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import { getCustomFields } from "@/lib/custom-fields";

export async function paymentFormData(ctx: CompanyContext) {
  const [customers, methods, notes, fields] = await Promise.all([
    db.customer.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true } }),
    db.paymentMethod.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.note.findMany({ where: { companyId: ctx.companyId, type: "Payment" }, orderBy: { name: "asc" } }),
    getCustomFields(ctx.companyId, "Payment"),
  ]);
  return {
    customers,
    methods,
    notes: notes.map((n) => ({ id: n.id, name: n.name, notes: n.notes })),
    defaultNote: notes.find((n) => n.isDefault)?.notes ?? "",
    company: { currency: ctx.settings.currency, locale: ctx.settings.locale },
    customFields: fields.map((f) => ({ id: f.id, label: f.label, type: f.type, placeholder: f.placeholder, options: f.options, defaultAnswer: f.defaultAnswer, isRequired: f.isRequired })),
  };
}
