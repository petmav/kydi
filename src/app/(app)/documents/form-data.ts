import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import { getCustomFields, lineFieldsFrom, type CfModel } from "@/lib/custom-fields";
import { nowTimeIn } from "@/server/invoices";
import { minorToInput } from "@/lib/money";
import { addDaysIso, isoDate, todayIn } from "@/lib/dates";
import type { DocInitial, LineState } from "@/components/documents/document-form";

/** Reference data for the shared document form. */
export async function documentFormData(ctx: CompanyContext, kind: "invoice" | "estimate" | "recurring") {
  const noteType = kind === "estimate" ? "Estimate" : "Invoice";
  const cfModel: CfModel = kind === "estimate" ? "Estimate" : "Invoice";
  const [customers, items, taxTypes, notes, fields, itemFields] = await Promise.all([
    db.customer.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, email: true } }),
    db.item.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, include: { unit: true, taxes: true }, take: 1000 }),
    db.taxType.findMany({ where: { companyId: ctx.companyId, transactionType: "SALES" }, orderBy: { name: "asc" } }),
    db.note.findMany({ where: { companyId: ctx.companyId, type: noteType }, orderBy: { name: "asc" } }),
    getCustomFields(ctx.companyId, cfModel),
    getCustomFields(ctx.companyId, "Item"),
  ]);
  const lineFields = lineFieldsFrom(itemFields);
  const itemAnswers = lineFields.length
    ? await db.customFieldValue.findMany({ where: { companyId: ctx.companyId, modelType: "Item", customFieldId: { in: lineFields.map((f) => f.id) }, modelId: { in: items.map((i) => i.id) } } })
    : [];
  const answersByItem = new Map<number, Record<string, string>>();
  for (const a of itemAnswers) if (a.value) answersByItem.set(a.modelId, { ...(answersByItem.get(a.modelId) ?? {}), [String(a.customFieldId)]: a.value });
  const s = ctx.settings;
  const auto = kind === "estimate" ? s.estimate_set_expiry_date_automatically === "YES" : s.invoice_set_due_date_automatically === "YES";
  const days = Number(kind === "estimate" ? s.estimate_expiry_date_days : s.invoice_due_date_days) || 7;
  return {
    customers,
    items: items.map((i) => ({ id: i.id, name: i.name, description: i.description, price: Number(i.price), unitName: i.unit?.name ?? null, taxIds: i.taxes.map((t) => t.taxTypeId), fields: answersByItem.get(i.id) ?? {} })),
    taxTypes: taxTypes.map((t) => ({ id: t.id, name: t.name, calculationType: t.calculationType, percent: t.percent, fixedAmount: t.fixedAmount === null ? null : Number(t.fixedAmount), compound: t.compound })),
    notes: notes.map((n) => ({ id: n.id, name: n.name, notes: n.notes })),
    defaultNote: notes.find((n) => n.isDefault)?.notes ?? "",
    company: {
      currency: s.currency,
      locale: s.locale,
      taxPerItem: s.tax_per_item === "YES",
      discountPerItem: s.discount_per_item === "YES",
      taxIncludedEnabled: s.tax_included === "YES",
      autoClosing: auto,
      closingDays: days,
    },
    customFields: fields.map((f) => ({ id: f.id, label: f.label, type: f.type, placeholder: f.placeholder, options: f.options, defaultAnswer: f.defaultAnswer, isRequired: f.isRequired })),
    lineFields: lineFields.map((f) => ({ id: f.id, label: f.label, type: f.type, placeholder: f.placeholder, options: f.options, defaultAnswer: null, isRequired: false })),
    useTime: kind !== "estimate" && s.invoice_use_time === "YES",
    nowTime: nowTimeIn(s.time_zone),
    today: todayIn(s.time_zone),
    autoClosing: auto,
    closingDays: days,
  };
}

export function newDocumentInitial(data: Awaited<ReturnType<typeof documentFormData>>, ctx: CompanyContext, kind: "invoice" | "estimate" | "recurring", customerId: number | null): DocInitial {
  const s = ctx.settings;
  return {
    customerId: customerId && data.customers.some((c) => c.id === customerId) ? customerId : null,
    date: data.today,
    time: data.useTime ? data.nowTime : "",
    closingDate: data.autoClosing ? addDaysIso(data.today, data.closingDays) : "",
    number: "",
    referenceNumber: "",
    exchangeRate: "",
    discountType: "FIXED",
    discount: "",
    taxIncluded: s.tax_included === "YES" && s.tax_included_by_default === "YES",
    notes: data.defaultNote,
    templateName: userTemplate(ctx, kind === "estimate" ? "estimate" : "invoice"),
    taxes: [],
    lines: [],
    recurring:
      kind === "recurring"
        ? { startsAt: data.today, frequency: "0 0 1 * *", limitBy: "NONE", limitCount: "", limitDate: "", status: "ACTIVE", sendAutomatically: false, notifyCreator: false }
        : undefined,
  };
}

function userTemplate(ctx: CompanyContext, kind: "invoice" | "estimate"): string {
  const u = (ctx.user.settings as Record<string, unknown> | null) ?? {};
  const t = u[`default_${kind}_template`];
  return typeof t === "string" && /^(invoice|estimate)[123]$/.test(t) ? t : ctx.settings[`default_${kind}_template`];
}

type StoredDoc = {
  customerId: number;
  exchangeRate: number;
  discountType: "FIXED" | "PERCENTAGE";
  discount: number;
  taxIncluded: boolean;
  notes: string | null;
  templateName: string;
  lines: { itemId: number | null; name: string; description: string | null; unitName: string | null; quantity: number; price: bigint; discountType: "FIXED" | "PERCENTAGE"; discount: number; customFields?: unknown; taxes: { taxTypeId: number | null }[] }[];
  taxes: { taxTypeId: number | null; lineItemId: number | null }[];
};

/** Maps a stored document into the form's initial state (major-unit strings). */
export function storedDocumentInitial(d: StoredDoc, extra: { date: Date | null; time?: string | null; closingDate: Date | null; number: string; referenceNumber: string | null }): DocInitial {
  const lines: LineState[] = d.lines.map((l, i) => ({
    key: `s${i}`,
    itemId: l.itemId,
    name: l.name,
    description: l.description ?? "",
    unitName: l.unitName ?? "",
    quantity: String(l.quantity),
    price: minorToInput(l.price),
    discountType: l.discountType,
    discount: l.discountType === "PERCENTAGE" ? String(l.discount || "") : l.discount ? minorToInput(l.discount) : "",
    taxes: l.taxes.map((t) => t.taxTypeId).filter((x): x is number => x !== null),
    customFields: l.customFields && typeof l.customFields === "object" ? (l.customFields as Record<string, string>) : {},
  }));
  return {
    customerId: d.customerId,
    date: extra.date ? isoDate(extra.date) : "",
    time: extra.time ?? "",
    closingDate: extra.closingDate ? isoDate(extra.closingDate) : "",
    number: extra.number,
    referenceNumber: extra.referenceNumber ?? "",
    exchangeRate: String(d.exchangeRate),
    discountType: d.discountType,
    discount: d.discountType === "PERCENTAGE" ? String(d.discount || "") : d.discount ? minorToInput(d.discount) : "",
    taxIncluded: d.taxIncluded,
    notes: d.notes ?? "",
    templateName: d.templateName,
    taxes: d.taxes.filter((t) => t.lineItemId === null).map((t) => t.taxTypeId).filter((x): x is number => x !== null),
    lines,
  };
}
