import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import type { FieldErrors } from "@/lib/action";
import { getCompanySettings } from "@/lib/settings";
import { MAX_MONEY, roundTo, toBase, toMinor } from "@/lib/money";
import { addDaysIso, isoDate, parseIsoDate, todayIn, zonedToUtc } from "@/lib/dates";
import { isCurrency } from "@/lib/intl-data";
import { cleanRichText } from "@/lib/sanitize-html";
import { renderNumber } from "@/domain/numbering";
import { allocationBaseAmounts } from "@/domain/allocation";
import { nextOccurrence } from "@/domain/cron";
import { billDue, billVoidError, computeBill, isDailyOrSlower, sourceRemaining, validateSettlements, type BillLineInput } from "@/domain/purchasing";
import type { TaxSpec } from "@/domain/totals";
import { logExchangeRate } from "./documents";

/** Purchasing: suppliers, bills, supplier credits, payments, refunds and recurring costs (spec §3.20, §4.14). */

type Tx = Prisma.TransactionClient;
export type PResult = { ok: true; id: number } | { ok: false; error: string; fieldErrors?: FieldErrors; status?: number };
const fail = (error: string, fieldErrors?: FieldErrors, status?: number): PResult => ({ ok: false, error, fieldErrors, status });
const optId = z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === "" || v == null ? null : Number(v)));
const optText = (max = 255) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const money = (v: string | number) => toMinor(v);

// ---- numbering -------------------------------------------------------------------------

export type PurchaseNumberKind = "bill" | "supplier_credit" | "supplier_payment" | "supplier_refund";

export async function nextPurchaseNumber(companyId: number, kind: PurchaseNumberKind, tx: Tx | typeof db = db) {
  const settings = await getCompanySettings(companyId);
  const agg =
    kind === "bill" || kind === "supplier_credit"
      ? await tx.bill.aggregate({ where: { companyId, type: kind === "bill" ? "BILL" : "SUPPLIER_CREDIT" }, _max: { sequenceNumber: true } })
      : await tx.supplierPayment.aggregate({ where: { companyId, type: kind === "supplier_payment" ? "PAYMENT" : "REFUND" }, _max: { sequenceNumber: true } });
  const sequence = (agg._max.sequenceNumber ?? 0) + 1;
  const [y, m, d] = todayIn(settings.time_zone).split("-").map(Number);
  const number = renderNumber(settings[`${kind}_number_format`], { sequence, customerSequence: sequence, customerPrefix: "SUP", date: new Date(y, m - 1, d) });
  return { number, sequence };
}

// ---- suppliers -------------------------------------------------------------------------

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Enter the supplier name.").max(255),
  contactName: optText(),
  email: z.string().trim().toLowerCase().max(255).optional().nullable().refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email address.").transform((v) => v || null),
  phone: optText(),
  website: z.string().trim().max(255).optional().nullable().refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "Enter a full URL starting with http:// or https://.").transform((v) => v || null),
  taxId: optText(),
  currency: z.string().refine(isCurrency, "Choose a currency."),
  expenseCategoryId: optId,
  paymentTerms: z.coerce.number().int("Use whole days.").min(0).max(365).default(30),
  street1: optText(),
  street2: optText(),
  city: optText(),
  state: optText(),
  zip: optText(),
  country: optText(),
  notes: optText(65000),
  enabled: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
});

export async function saveSupplier(ctx: CompanyContext, id: number | null, input: z.infer<typeof supplierSchema>): Promise<PResult> {
  const existing = id ? await db.supplier.findFirst({ where: { id, companyId: ctx.companyId } }) : null;
  if (id && !existing) return fail("Supplier not found.", undefined, 404);
  if (input.expenseCategoryId && !(await db.expenseCategory.findFirst({ where: { id: input.expenseCategoryId, companyId: ctx.companyId } }))) {
    return fail("Choose a valid category.", { expenseCategoryId: ["Choose a valid category."] });
  }
  if (existing && existing.currency !== input.currency && (await supplierHasDocuments(existing.id))) {
    return fail("The currency cannot change once the supplier has documents.", { currency: ["Locked: the supplier has documents."] });
  }
  const data = { ...input, enabled: id ? input.enabled : true };
  const row = existing ? await db.supplier.update({ where: { id: existing.id }, data }) : await db.supplier.create({ data: { ...data, companyId: ctx.companyId, creatorId: ctx.user.id } });
  return { ok: true, id: row.id };
}

export async function supplierHasDocuments(supplierId: number): Promise<boolean> {
  const [b, p, r] = await Promise.all([db.bill.count({ where: { supplierId } }), db.supplierPayment.count({ where: { supplierId } }), db.recurringCost.count({ where: { supplierId } })]);
  return b + p + r > 0;
}

export async function deleteSupplier(ctx: CompanyContext, id: number): Promise<PResult> {
  const s = await db.supplier.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!s) return fail("Supplier not found.", undefined, 404);
  if (await supplierHasDocuments(id)) return fail("This supplier has bills, payments or recurring costs. Disable it instead.");
  await db.supplier.delete({ where: { id } });
  return { ok: true, id };
}

/** Outstanding (due) per supplier, in supplier currency and base currency. */
export async function supplierBalances(companyId: number, supplierIds: number[]) {
  const rows = await db.bill.groupBy({
    by: ["supplierId"],
    where: { companyId, supplierId: { in: supplierIds }, type: "BILL", status: "OPEN" },
    _sum: { dueAmount: true, baseDueAmount: true },
  });
  const out = new Map<number, { due: number; baseDue: number }>(supplierIds.map((id) => [id, { due: 0, baseDue: 0 }]));
  for (const r of rows) out.set(r.supplierId, { due: Number(r._sum.dueAmount ?? 0), baseDue: Number(r._sum.baseDueAmount ?? 0) });
  return out;
}

function snapshot(s: { name: string; contactName: string | null; email: string | null; phone: string | null; taxId: string | null; street1: string | null; street2: string | null; city: string | null; state: string | null; zip: string | null; country: string | null }) {
  return { name: s.name, contactName: s.contactName, email: s.email, phone: s.phone, taxId: s.taxId, street1: s.street1, street2: s.street2, city: s.city, state: s.state, zip: s.zip, country: s.country };
}

// ---- bills and supplier credits --------------------------------------------------------

const lineSchema = z.object({
  expenseCategoryId: z.coerce.number({ invalid_type_error: "Choose a category." }).int().positive("Choose a category."),
  description: z.string().trim().min(1, "Enter a description.").max(1000),
  quantity: z.coerce.number({ invalid_type_error: "Enter a quantity." }).positive("Quantity must be above 0."),
  price: z.union([z.string(), z.number()]),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).default("PERCENTAGE"),
  discount: z.union([z.string(), z.number()]).optional(),
  taxTypeIds: z.array(z.coerce.number().int().positive()).default([]),
  sourceBillLineId: optId,
});

export const billSchema = z.object({
  type: z.enum(["BILL", "SUPPLIER_CREDIT"]).default("BILL"),
  supplierId: z.coerce.number({ invalid_type_error: "Choose a supplier." }).int().positive("Choose a supplier."),
  number: z.string().trim().max(100).optional().default(""),
  reference: optText(),
  documentDate: z.string().min(1, "Enter the date."),
  dueDate: z.string().optional().nullable(),
  exchangeRate: z.union([z.string(), z.number()]).optional(),
  taxIncluded: z.boolean().default(false),
  notes: z.string().max(65000).optional().nullable(),
  sourceBillId: optId,
  lines: z.array(lineSchema).min(1, "Add at least one line."),
  intent: z.enum(["draft", "open"]).default("draft"),
});
export type BillInput = z.infer<typeof billSchema>;

async function purchaseTaxSpecs(companyId: number, ids: number[]): Promise<Map<number, TaxSpec>> {
  const rows = ids.length ? await db.taxType.findMany({ where: { companyId, id: { in: ids }, transactionType: "PURCHASES" } }) : [];
  return new Map(
    rows.map((t) => [t.id, { taxTypeId: t.id, name: t.name, calculationType: t.calculationType, percent: t.percent, fixedAmount: t.fixedAmount === null ? null : Number(t.fixedAmount), compound: t.compound }]),
  );
}

function parseRate(raw: string | number | undefined, currency: string, base: string): number | null {
  if (currency === base) return 1;
  const r = roundTo(Number(String(raw ?? "").replace(",", ".")), 6);
  return Number.isFinite(r) && r > 0 ? r : null;
}

/** Recomputes a bill's due amounts from its settlements and sets the financial lock (spec §4.14). */
export async function refreshBill(tx: Tx, billId: number) {
  const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
  const settled = Number((await tx.billSettlement.aggregate({ where: { billId }, _sum: { amount: true } }))._sum.amount ?? 0);
  const activeCredits = await tx.bill.count({ where: { sourceBillId: billId, type: "SUPPLIER_CREDIT", status: { not: "VOID" } } });
  const due = bill.status === "VOID" ? 0 : billDue(Number(bill.total), settled);
  const locked = settled > 0 || activeCredits > 0;
  await tx.bill.update({
    where: { id: billId },
    data: { dueAmount: due, baseDueAmount: toBase(due, bill.exchangeRate), financialLockedAt: locked ? (bill.financialLockedAt ?? new Date()) : null },
  });
}

export async function saveBill(ctx: CompanyContext, id: number | null, input: BillInput): Promise<PResult> {
  const existing = id ? await db.bill.findFirst({ where: { id, companyId: ctx.companyId }, include: { supplier: true } }) : null;
  if (id && !existing) return fail("Document not found.", undefined, 404);
  if (existing?.status === "VOID") return fail("Void documents cannot be edited.");
  const type = existing?.type ?? input.type;
  const errors: FieldErrors = {};
  const notes = cleanRichText(input.notes);
  const dueDate = input.dueDate ? parseIsoDate(input.dueDate) : null;
  if (input.dueDate && !dueDate) errors.dueDate = ["Enter a valid date."];

  // Locked bills: only reference, due date and notes may change.
  if (existing?.financialLockedAt) {
    if (Object.keys(errors).length) return fail("Please correct the highlighted fields.", errors);
    await db.bill.update({ where: { id: existing.id }, data: { reference: input.reference, dueDate: type === "BILL" ? dueDate : null, notes } });
    return { ok: true, id: existing.id };
  }

  const supplier = await db.supplier.findFirst({ where: { id: input.supplierId, companyId: ctx.companyId } });
  if (!supplier) errors.supplierId = ["Choose a supplier."];
  else if (!supplier.enabled && (!existing || existing.supplierId !== supplier.id)) errors.supplierId = ["This supplier is disabled."];
  const date = parseIsoDate(input.documentDate);
  if (!date) errors.documentDate = ["Enter a valid date."];
  const base = ctx.settings.currency;
  const currency = supplier?.currency ?? base;
  const rate = parseRate(input.exchangeRate, currency, base);
  if (rate === null) errors.exchangeRate = ["Enter the exchange rate."];

  const categoryIds = [...new Set(input.lines.map((l) => l.expenseCategoryId))];
  const cats = await db.expenseCategory.count({ where: { companyId: ctx.companyId, id: { in: categoryIds } } });
  if (cats !== categoryIds.length) errors.lines = ["Choose a valid category on every line."];
  const taxes = await purchaseTaxSpecs(ctx.companyId, input.lines.flatMap((l) => l.taxTypeIds));
  const lines: BillLineInput[] = input.lines.map((l, i) => {
    const price = money(l.price);
    if (!Number.isInteger(price) || price < 0 || price > MAX_MONEY) errors[`lines.${i}.price`] = ["Enter a valid price."];
    const discount = l.discountType === "FIXED" ? money(l.discount ?? 0) : Number(l.discount ?? 0);
    if (!Number.isFinite(discount) || discount < 0 || (l.discountType === "PERCENTAGE" && discount > 100)) errors[`lines.${i}.discount`] = ["Enter a valid discount."];
    if (new Set(l.taxTypeIds).size !== l.taxTypeIds.length) errors[`lines.${i}.taxes`] = ["A tax can be applied once per line."];
    return { expenseCategoryId: l.expenseCategoryId, description: l.description, quantity: roundTo(l.quantity, 2), price, discountType: l.discountType, discount, taxes: l.taxTypeIds.map((t) => taxes.get(t)).filter((t): t is TaxSpec => !!t) };
  });
  const result = computeBill(lines, input.taxIncluded, rate ?? 1);
  if (result.total <= 0) errors.lines = ["The total must be above 0."];
  if (result.total > MAX_MONEY) errors.lines = ["The total is too large."];

  // Credits raised against a bill: same supplier and currency, total within what is left to credit.
  let sourceBill: Awaited<ReturnType<typeof db.bill.findFirst>> = null;
  if (type === "SUPPLIER_CREDIT" && input.sourceBillId) {
    sourceBill = await db.bill.findFirst({ where: { id: input.sourceBillId, companyId: ctx.companyId, type: "BILL" } });
    if (!sourceBill || sourceBill.status !== "OPEN") errors.sourceBillId = ["Credits can be raised against open bills only."];
    else if (sourceBill.supplierId !== input.supplierId) errors.supplierId = ["Use the supplier of the source bill."];
    else {
      const credited = Number((await db.bill.aggregate({ where: { sourceBillId: sourceBill.id, type: "SUPPLIER_CREDIT", status: { not: "VOID" }, NOT: id ? { id } : undefined }, _sum: { total: true } }))._sum.total ?? 0);
      if (result.total > Number(sourceBill.total) - credited) errors.lines = [`The credit exceeds what is left to credit on ${sourceBill.number}.`];
    }
  }

  let number = input.number;
  if (number && (await db.bill.findFirst({ where: { companyId: ctx.companyId, type, number, NOT: id ? { id } : undefined } }))) errors.number = ["This number is already used."];
  if (Object.keys(errors).length) return fail("Please correct the highlighted fields.", errors);

  const status = type === "SUPPLIER_CREDIT" ? "OPEN" : existing ? (existing.status === "DRAFT" && input.intent === "open" ? "OPEN" : existing.status) : input.intent === "open" ? "OPEN" : "DRAFT";
  const due = type === "BILL" ? dueDate ?? parseIsoDate(addDaysIso(isoDate(date!), supplier!.paymentTerms)) : null;

  const savedId = await db.$transaction(async (tx) => {
    let sequence = existing?.sequenceNumber ?? 0;
    if (!existing) {
      const next = await nextPurchaseNumber(ctx.companyId, type === "BILL" ? "bill" : "supplier_credit", tx);
      sequence = next.sequence;
      if (!number) number = next.number;
    }
    const data = {
      supplierId: supplier!.id,
      number: number || existing!.number,
      sequenceNumber: sequence,
      reference: input.reference,
      status,
      documentDate: date!,
      dueDate: due,
      currency,
      exchangeRate: rate!,
      taxIncluded: input.taxIncluded,
      subTotal: result.subTotal,
      tax: result.tax,
      total: result.total,
      baseTotal: result.baseTotal,
      dueAmount: type === "BILL" ? result.total : 0,
      baseDueAmount: type === "BILL" ? result.baseTotal : 0,
      notes,
      supplierSnapshot: snapshot(supplier!),
      sourceBillId: sourceBill?.id ?? null,
    };
    const bill = existing
      ? await tx.bill.update({ where: { id: existing.id }, data })
      : await tx.bill.create({ data: { ...data, type, companyId: ctx.companyId, creatorId: ctx.user.id } });
    if (existing) await tx.billLine.deleteMany({ where: { billId: bill.id } });
    for (const [i, l] of lines.entries()) {
      const r = result.lines[i];
      await tx.billLine.create({
        data: {
          billId: bill.id,
          position: i,
          expenseCategoryId: l.expenseCategoryId,
          description: l.description,
          quantity: l.quantity,
          price: l.price,
          discountType: l.discountType,
          discount: l.discountType === "FIXED" ? l.discount / 100 : l.discount,
          subTotal: r.subTotal,
          discountVal: r.discountVal,
          tax: r.tax,
          total: r.total,
          baseTotal: r.baseTotal,
          sourceBillLineId: input.lines[i].sourceBillLineId,
          taxes: { create: r.taxes.map((t) => ({ taxTypeId: t.taxTypeId, name: t.name, calculationType: t.calculationType, percent: t.percent, fixedAmount: t.fixedAmount, compound: t.compound, amount: t.amount, baseAmount: t.baseAmount })) },
        },
      });
    }
    await logExchangeRate(tx, ctx.companyId, currency, base, rate!);
    // A credit raised against an open bill is applied to it straight away (up to the bill's due amount).
    if (!existing && sourceBill) {
      await tx.$queryRaw`SELECT id FROM "Bill" WHERE id = ${sourceBill.id} FOR UPDATE`;
      const fresh = await tx.bill.findUniqueOrThrow({ where: { id: sourceBill.id } });
      const amount = Math.min(result.total, Number(fresh.dueAmount));
      if (amount > 0) await tx.billSettlement.create({ data: { billId: fresh.id, creditId: bill.id, amount, baseAmount: toBase(amount, bill.exchangeRate) } });
      await refreshBill(tx, fresh.id);
    }
    if (type === "BILL") await refreshBill(tx, bill.id);
    return bill.id;
  });
  return { ok: true, id: savedId };
}

export async function openBill(ctx: CompanyContext, id: number): Promise<PResult> {
  const bill = await db.bill.findFirst({ where: { id, companyId: ctx.companyId, type: "BILL" } });
  if (!bill) return fail("Bill not found.", undefined, 404);
  if (bill.status !== "DRAFT") return fail("Only draft bills can be opened.");
  await db.bill.update({ where: { id }, data: { status: "OPEN" } });
  return { ok: true, id };
}

/** Void a bill or supplier credit (reason required; refused while allocated, credited or refunded). */
export async function voidBill(ctx: CompanyContext, id: number, reason: string): Promise<PResult> {
  const bill = await db.bill.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!bill) return fail("Document not found.", undefined, 404);
  if (bill.type === "BILL") {
    const [settlements, activeCredits] = await Promise.all([db.billSettlement.count({ where: { billId: id } }), db.bill.count({ where: { sourceBillId: id, status: { not: "VOID" } } })]);
    const err = billVoidError({ status: bill.status, settlements, activeCredits }, reason);
    if (err) return fail(err, { reason: [err] });
  } else {
    if (bill.status === "VOID") return fail("This credit is already void.");
    if (!reason.trim()) return fail("Enter a reason for voiding.", { reason: ["Enter a reason."] });
    const [allocated, refunds] = await Promise.all([db.billSettlement.count({ where: { creditId: id } }), db.supplierPayment.count({ where: { refundOfCreditId: id, status: "OPEN" } })]);
    if (allocated) return fail("Remove this credit's allocations to bills before voiding it.");
    if (refunds) return fail("Void the refunds of this credit first.");
  }
  await db.$transaction(async (tx) => {
    await tx.bill.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason.trim().slice(0, 500), dueAmount: 0, baseDueAmount: 0 } });
    if (bill.sourceBillId) await refreshBill(tx, bill.sourceBillId);
  });
  return { ok: true, id };
}

export async function deleteBill(ctx: CompanyContext, id: number): Promise<PResult> {
  const bill = await db.bill.findFirst({ where: { id, companyId: ctx.companyId }, include: { _count: { select: { settlements: true, creditSettlements: true, credits: true, refunds: true } } } });
  if (!bill) return fail("Document not found.", undefined, 404);
  const c = bill._count;
  if (c.settlements || c.creditSettlements || c.credits || c.refunds) return fail("This document has allocations, credits or refunds. Void it instead.");
  await db.$transaction(async (tx) => {
    await tx.bill.delete({ where: { id } });
    if (bill.sourceBillId) await refreshBill(tx, bill.sourceBillId);
  });
  return { ok: true, id };
}

// ---- settlements (payment or credit -> bills) --------------------------------------------

export type AllocationInput = { billId: number; amount: number };

async function applySettlements(
  tx: Tx,
  ctx: CompanyContext,
  source: { kind: "payment" | "credit"; id: number; supplierId: number; currency: string; amount: number; baseAmount: number; available: number },
  rows: AllocationInput[],
): Promise<FieldErrors | null> {
  const key = source.kind === "payment" ? "supplierPaymentId" : "creditId";
  const current = await tx.billSettlement.findMany({ where: { [key]: source.id } });
  const ids = [...new Set([...rows.map((r) => r.billId), ...current.map((c) => c.billId)])].sort((a, b) => a - b);
  for (const billId of ids) await tx.$queryRaw`SELECT id FROM "Bill" WHERE id = ${billId} FOR UPDATE`;
  const bills = await tx.bill.findMany({ where: { id: { in: rows.map((r) => r.billId) }, companyId: ctx.companyId, type: "BILL" } });
  const errors: FieldErrors = {};
  const checks = rows.map((r) => {
    const b = bills.find((x) => x.id === r.billId);
    if (!b || b.status !== "OPEN" || b.supplierId !== source.supplierId || b.currency !== source.currency) {
      errors[`allocations.${r.billId}`] = ["Choose an open bill of this supplier in the same currency."];
      return { billId: r.billId, amount: r.amount, available: 0 };
    }
    const mine = Number(current.find((c) => c.billId === r.billId)?.amount ?? 0);
    return { billId: r.billId, amount: r.amount, available: Number(b.dueAmount) + mine };
  });
  const v = validateSettlements(source.available, checks);
  for (const [k, msg] of Object.entries(v)) errors[k === "0" ? "allocations" : `allocations.${k}`] = [msg];
  if (Object.keys(errors).length) return errors;
  await tx.billSettlement.deleteMany({ where: { [key]: source.id } });
  const bases = allocationBaseAmounts(source.amount, source.baseAmount, rows.map((r) => r.amount));
  for (const [i, r] of rows.entries()) await tx.billSettlement.create({ data: { billId: r.billId, [key]: source.id, amount: r.amount, baseAmount: bases[i] } });
  for (const billId of ids) await refreshBill(tx, billId);
  return null;
}

class ValidationAbort extends Error {
  constructor(public fieldErrors: FieldErrors) {
    super("validation");
  }
}

export async function allocateCredit(ctx: CompanyContext, creditId: number, rows: AllocationInput[]): Promise<PResult> {
  const credit = await db.bill.findFirst({ where: { id: creditId, companyId: ctx.companyId, type: "SUPPLIER_CREDIT" } });
  if (!credit) return fail("Supplier credit not found.", undefined, 404);
  if (credit.status !== "OPEN") return fail("Only open credits can be allocated.");
  const refunded = Number((await db.supplierPayment.aggregate({ where: { refundOfCreditId: creditId, status: "OPEN" }, _sum: { amount: true } }))._sum.amount ?? 0);
  try {
    await db.$transaction(async (tx) => {
      const errs = await applySettlements(tx, ctx, { kind: "credit", id: credit.id, supplierId: credit.supplierId, currency: credit.currency, amount: Number(credit.total), baseAmount: Number(credit.baseTotal), available: Number(credit.total) - refunded }, rows.filter((r) => r.amount > 0));
      if (errs) throw new ValidationAbort(errs);
    });
  } catch (e) {
    if (e instanceof ValidationAbort) return fail("Please correct the allocations.", e.fieldErrors);
    throw e;
  }
  return { ok: true, id: creditId };
}

// ---- supplier payments and refunds -----------------------------------------------------------

export const supplierPaymentSchema = z.object({
  supplierId: z.coerce.number({ invalid_type_error: "Choose a supplier." }).int().positive("Choose a supplier."),
  number: z.string().trim().max(100).optional().default(""),
  reference: optText(),
  paymentDate: z.string().min(1, "Enter the payment date."),
  amount: z.union([z.string(), z.number()]),
  exchangeRate: z.union([z.string(), z.number()]).optional(),
  paymentMethodId: optId,
  notes: optText(65000),
  allocations: z.array(z.object({ billId: z.coerce.number().int().positive(), amount: z.union([z.string(), z.number()]) })).default([]),
});
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;

async function paymentCommon(ctx: CompanyContext, input: { supplierId: number; paymentDate: string; amount: string | number; exchangeRate?: string | number; paymentMethodId: number | null; number: string }, type: "PAYMENT" | "REFUND", id: number | null) {
  const errors: FieldErrors = {};
  const supplier = await db.supplier.findFirst({ where: { id: input.supplierId, companyId: ctx.companyId } });
  if (!supplier) errors.supplierId = ["Choose a supplier."];
  const date = parseIsoDate(input.paymentDate);
  if (!date) errors.paymentDate = ["Enter a valid date."];
  const amount = money(input.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_MONEY) errors.amount = ["Enter an amount above 0."];
  const currency = supplier?.currency ?? ctx.settings.currency;
  const rate = parseRate(input.exchangeRate, currency, ctx.settings.currency);
  if (rate === null) errors.exchangeRate = ["Enter the exchange rate."];
  if (input.paymentMethodId && !(await db.paymentMethod.findFirst({ where: { id: input.paymentMethodId, companyId: ctx.companyId } }))) errors.paymentMethodId = ["Choose a valid payment mode."];
  if (input.number && (await db.supplierPayment.findFirst({ where: { companyId: ctx.companyId, type, number: input.number, NOT: id ? { id } : undefined } }))) errors.number = ["This number is already used."];
  return { errors, supplier, date, amount, currency, rate: rate ?? 1 };
}

export async function saveSupplierPayment(ctx: CompanyContext, id: number | null, input: SupplierPaymentInput): Promise<PResult> {
  const existing = id ? await db.supplierPayment.findFirst({ where: { id, companyId: ctx.companyId, type: "PAYMENT" } }) : null;
  if (id && !existing) return fail("Supplier payment not found.", undefined, 404);
  if (existing?.status === "VOID") return fail("Void payments cannot be edited.");
  const c = await paymentCommon(ctx, input, "PAYMENT", id);
  if (existing && existing.supplierId !== input.supplierId && (await db.billSettlement.count({ where: { supplierPaymentId: existing.id } }))) c.errors.supplierId = ["Remove the allocations before changing the supplier."];
  if (!existing && c.supplier && !c.supplier.enabled) c.errors.supplierId = ["This supplier is disabled."];
  const refunded = existing ? Number((await db.supplierPayment.aggregate({ where: { refundOfPaymentId: existing.id, status: "OPEN" }, _sum: { amount: true } }))._sum.amount ?? 0) : 0;
  const rows = input.allocations.map((a) => ({ billId: a.billId, amount: money(a.amount) })).filter((a) => a.amount > 0);
  if (c.amount < refunded) c.errors.amount = ["The amount cannot be lower than what was refunded."];
  if (Object.keys(c.errors).length) return fail("Please correct the highlighted fields.", c.errors);
  const baseAmount = toBase(c.amount, c.rate);
  try {
    const savedId = await db.$transaction(async (tx) => {
      let number = input.number;
      let sequence = existing?.sequenceNumber ?? 0;
      if (!existing) {
        const next = await nextPurchaseNumber(ctx.companyId, "supplier_payment", tx);
        sequence = next.sequence;
        if (!number) number = next.number;
      }
      const data = { supplierId: c.supplier!.id, number: number || existing!.number, sequenceNumber: sequence, reference: input.reference, paymentDate: c.date!, amount: c.amount, baseAmount, currency: c.currency, exchangeRate: c.rate, paymentMethodId: input.paymentMethodId, notes: cleanRichText(input.notes) };
      const p = existing ? await tx.supplierPayment.update({ where: { id: existing.id }, data }) : await tx.supplierPayment.create({ data: { ...data, type: "PAYMENT", companyId: ctx.companyId, creatorId: ctx.user.id } });
      const errs = await applySettlements(tx, ctx, { kind: "payment", id: p.id, supplierId: p.supplierId, currency: p.currency, amount: c.amount, baseAmount, available: c.amount - refunded }, rows);
      if (errs) throw new ValidationAbort(errs);
      await logExchangeRate(tx, ctx.companyId, c.currency, ctx.settings.currency, c.rate);
      return p.id;
    });
    return { ok: true, id: savedId };
  } catch (e) {
    if (e instanceof ValidationAbort) return fail("Please correct the allocations.", e.fieldErrors);
    throw e;
  }
}

export const refundSchema = z.object({
  source: z.string().regex(/^(payment|credit):\d+$/, "Choose the payment or credit being refunded."),
  number: z.string().trim().max(100).optional().default(""),
  reference: optText(),
  paymentDate: z.string().min(1, "Enter the refund date."),
  amount: z.union([z.string(), z.number()]),
  exchangeRate: z.union([z.string(), z.number()]).optional(),
  paymentMethodId: optId,
  notes: optText(65000),
});

/** Remaining refundable balance of a supplier payment or credit. */
export async function refundableBalance(companyId: number, kind: "payment" | "credit", id: number, excludeRefundId?: number) {
  const refunds = Number((await db.supplierPayment.aggregate({ where: { [kind === "payment" ? "refundOfPaymentId" : "refundOfCreditId"]: id, status: "OPEN", NOT: excludeRefundId ? { id: excludeRefundId } : undefined }, _sum: { amount: true } }))._sum.amount ?? 0);
  if (kind === "payment") {
    const p = await db.supplierPayment.findFirst({ where: { id, companyId, type: "PAYMENT", status: "OPEN" } });
    if (!p) return null;
    const allocated = Number((await db.billSettlement.aggregate({ where: { supplierPaymentId: id }, _sum: { amount: true } }))._sum.amount ?? 0);
    return { supplierId: p.supplierId, currency: p.currency, remaining: sourceRemaining(Number(p.amount), allocated, refunds), label: p.number };
  }
  const b = await db.bill.findFirst({ where: { id, companyId, type: "SUPPLIER_CREDIT", status: "OPEN" } });
  if (!b) return null;
  const allocated = Number((await db.billSettlement.aggregate({ where: { creditId: id }, _sum: { amount: true } }))._sum.amount ?? 0);
  return { supplierId: b.supplierId, currency: b.currency, remaining: sourceRemaining(Number(b.total), allocated, refunds), label: b.number };
}

export async function saveRefund(ctx: CompanyContext, input: z.infer<typeof refundSchema>): Promise<PResult> {
  const [kind, raw] = input.source.split(":") as ["payment" | "credit", string];
  const src = await refundableBalance(ctx.companyId, kind, Number(raw));
  if (!src) return fail("Choose an open payment or credit.", { source: ["Choose an open payment or credit."] });
  const c = await paymentCommon(ctx, { ...input, supplierId: src.supplierId }, "REFUND", null);
  if (c.amount > src.remaining) c.errors.amount = ["The refund exceeds the remaining balance."];
  if (Object.keys(c.errors).length) return fail("Please correct the highlighted fields.", c.errors);
  const id = await db.$transaction(async (tx) => {
    if (kind === "payment") await tx.$queryRaw`SELECT id FROM "SupplierPayment" WHERE id = ${Number(raw)} FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM "Bill" WHERE id = ${Number(raw)} FOR UPDATE`;
    const next = await nextPurchaseNumber(ctx.companyId, "supplier_refund", tx);
    const r = await tx.supplierPayment.create({
      data: {
        companyId: ctx.companyId,
        creatorId: ctx.user.id,
        type: "REFUND",
        supplierId: src.supplierId,
        number: input.number || next.number,
        sequenceNumber: next.sequence,
        reference: input.reference,
        paymentDate: c.date!,
        amount: c.amount,
        baseAmount: toBase(c.amount, c.rate),
        currency: src.currency,
        exchangeRate: c.rate,
        paymentMethodId: input.paymentMethodId,
        notes: cleanRichText(input.notes),
        refundOfPaymentId: kind === "payment" ? Number(raw) : null,
        refundOfCreditId: kind === "credit" ? Number(raw) : null,
      },
    });
    return r.id;
  });
  return { ok: true, id };
}

/** Void a supplier payment (removes its allocations) or a refund. Reason required. */
export async function voidSupplierPayment(ctx: CompanyContext, id: number, reason: string): Promise<PResult> {
  const p = await db.supplierPayment.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!p) return fail("Not found.", undefined, 404);
  if (p.status === "VOID") return fail("Already void.");
  if (!reason.trim()) return fail("Enter a reason for voiding.", { reason: ["Enter a reason."] });
  if (p.type === "PAYMENT" && (await db.supplierPayment.count({ where: { refundOfPaymentId: id, status: "OPEN" } }))) return fail("Void the refunds of this payment first.");
  await db.$transaction(async (tx) => {
    const bills = (await tx.billSettlement.findMany({ where: { supplierPaymentId: id }, select: { billId: true } })).map((s) => s.billId);
    await tx.billSettlement.deleteMany({ where: { supplierPaymentId: id } });
    await tx.supplierPayment.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason.trim().slice(0, 500) } });
    for (const b of bills) await refreshBill(tx, b);
  });
  return { ok: true, id };
}

export async function deleteSupplierPayment(ctx: CompanyContext, id: number): Promise<PResult> {
  const p = await db.supplierPayment.findFirst({ where: { id, companyId: ctx.companyId }, include: { _count: { select: { settlements: true, refunds: true } } } });
  if (!p) return fail("Not found.", undefined, 404);
  if (p._count.settlements || p._count.refunds) return fail("This payment is allocated or refunded. Void it instead.");
  await db.supplierPayment.delete({ where: { id } });
  return { ok: true, id };
}

// ---- recurring costs ---------------------------------------------------------------------

export const recurringCostSchema = z.object({
  supplierId: z.coerce.number({ invalid_type_error: "Choose a supplier." }).int().positive("Choose a supplier."),
  name: z.string().trim().min(2, "Enter a name.").max(255),
  mode: z.enum(["BILL", "EXPENSE"]),
  frequency: z.string().trim().refine(isDailyOrSlower, "Choose a daily or slower schedule."),
  startsAt: z.string().min(1, "Enter the start date."),
  limitBy: z.enum(["NONE", "COUNT", "DATE"]).default("NONE"),
  limitCount: optId,
  limitDate: z.string().optional().nullable(),
  dueDays: z.coerce.number().int().min(0).max(365).default(30),
  createAsDraft: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
  notifyCreator: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
  expenseCategoryId: z.coerce.number({ invalid_type_error: "Choose a category." }).int().positive("Choose a category."),
  description: z.string().trim().min(1, "Enter a description.").max(1000),
  amount: z.union([z.string(), z.number()]),
  taxTypeIds: z.preprocess((v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(z.coerce.number().int().positive())),
});

type CostTemplate = { expenseCategoryId: number; description: string; amount: number; taxTypeIds: number[] };

export async function saveRecurringCost(ctx: CompanyContext, id: number | null, input: z.infer<typeof recurringCostSchema>): Promise<PResult> {
  const existing = id ? await db.recurringCost.findFirst({ where: { id, companyId: ctx.companyId } }) : null;
  if (id && !existing) return fail("Recurring cost not found.", undefined, 404);
  const errors: FieldErrors = {};
  const supplier = await db.supplier.findFirst({ where: { id: input.supplierId, companyId: ctx.companyId } });
  if (!supplier) errors.supplierId = ["Choose a supplier."];
  if (existing && existing.runCount > 0 && existing.supplierId !== input.supplierId) errors.supplierId = ["The supplier cannot change after the first run."];
  if (!(await db.expenseCategory.findFirst({ where: { id: input.expenseCategoryId, companyId: ctx.companyId } }))) errors.expenseCategoryId = ["Choose a category."];
  const amount = money(input.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_MONEY) errors.amount = ["Enter an amount above 0."];
  const start = parseIsoDate(input.startsAt);
  if (!start) errors.startsAt = ["Enter a valid date."];
  if (input.limitBy === "COUNT" && !(input.limitCount && input.limitCount > 0)) errors.limitCount = ["Enter how many times to run."];
  const limitDate = input.limitBy === "DATE" ? parseIsoDate(input.limitDate ?? "") : null;
  if (input.limitBy === "DATE" && !limitDate) errors.limitDate = ["Enter the end date."];
  if (Object.keys(errors).length) return fail("Please correct the highlighted fields.", errors);
  const tz = ctx.settings.time_zone;
  const [y, m, d] = input.startsAt.split("-").map(Number);
  const startsAt = zonedToUtc(y, m, d, 0, 0, tz);
  const first = nextOccurrence(input.frequency, new Date(Math.max(startsAt.getTime(), Date.now()) - 60_000), tz);
  const template: CostTemplate = { expenseCategoryId: input.expenseCategoryId, description: input.description, amount, taxTypeIds: input.taxTypeIds };
  const data = {
    supplierId: input.supplierId,
    name: input.name,
    mode: input.mode,
    frequency: input.frequency,
    startsAt,
    nextRunAt: existing?.status === "COMPLETED" ? null : first,
    limitBy: input.limitBy,
    limitCount: input.limitBy === "COUNT" ? input.limitCount : null,
    limitDate,
    dueDays: input.dueDays,
    createAsDraft: input.createAsDraft,
    notifyCreator: input.notifyCreator,
    template,
  };
  const row = existing ? await db.recurringCost.update({ where: { id: existing.id }, data }) : await db.recurringCost.create({ data: { ...data, companyId: ctx.companyId, creatorId: ctx.user.id } });
  return { ok: true, id: row.id };
}

export async function setRecurringCostStatus(ctx: CompanyContext, id: number, action: "pause" | "resume"): Promise<PResult> {
  const r = await db.recurringCost.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!r) return fail("Recurring cost not found.", undefined, 404);
  if (r.status === "COMPLETED") return fail("This recurring cost has completed.");
  const settings = await getCompanySettings(r.companyId);
  await db.recurringCost.update({
    where: { id },
    data: action === "pause" ? { status: "ON_HOLD" } : { status: "ACTIVE", lastError: null, nextRunAt: nextOccurrence(r.frequency, new Date(), settings.time_zone) },
  });
  return { ok: true, id };
}

export async function deleteRecurringCost(ctx: CompanyContext, id: number): Promise<PResult> {
  const r = await db.recurringCost.deleteMany({ where: { id, companyId: ctx.companyId } });
  return r.count ? { ok: true, id } : fail("Recurring cost not found.", undefined, 404);
}

/** Generates bills/expenses for due recurring costs (spec §4.14, §4.15: every minute). */
export async function runDueRecurringCosts(now = new Date()): Promise<number> {
  const due = await db.recurringCost.findMany({ where: { status: "ACTIVE", nextRunAt: { lte: now } }, select: { id: true }, take: 200 });
  let generated = 0;
  for (const { id } of due) {
    try {
      if (await runCost(id, now)) generated++;
    } catch (e) {
      console.error(`[kydi] recurring cost ${id} failed`, e);
      await db.recurringCost.update({ where: { id }, data: { lastError: "recurring_cost_failed", nextRunAt: new Date(now.getTime() + 3600_000) } }).catch(() => undefined);
    }
  }
  return generated;
}

async function runCost(id: number, now: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "RecurringCost" WHERE id = ${id} FOR UPDATE`;
    const r = await tx.recurringCost.findUnique({ where: { id }, include: { supplier: true } });
    if (!r || r.status !== "ACTIVE" || !r.nextRunAt || r.nextRunAt > now) return false;
    const settings = await getCompanySettings(r.companyId);
    const tz = settings.time_zone;
    const runDate = todayIn(tz, r.nextRunAt);
    const limitHit = (r.limitBy === "COUNT" && r.limitCount !== null && r.runCount >= r.limitCount) || (r.limitBy === "DATE" && r.limitDate !== null && runDate > isoDate(r.limitDate));
    if (limitHit) {
      await tx.recurringCost.update({ where: { id }, data: { status: "COMPLETED", nextRunAt: null } });
      return false;
    }
    const t = r.template as unknown as CostTemplate;
    const base = settings.currency;
    const currency = r.supplier.currency;
    let rate = 1;
    if (currency !== base) {
      const last = await tx.exchangeRateLog.findFirst({ where: { companyId: r.companyId, currency }, orderBy: { createdAt: "desc" } });
      if (!last) {
        await tx.recurringCost.update({ where: { id }, data: { lastError: "exchange_rate_missing", nextRunAt: new Date(now.getTime() + 3600_000) } });
        return false;
      }
      rate = last.rate;
    }
    const date = parseIsoDate(runDate)!;
    if (r.mode === "EXPENSE") {
      await tx.expense.create({ data: { companyId: r.companyId, creatorId: r.creatorId, expenseDate: date, categoryId: t.expenseCategoryId, amount: t.amount, currency, exchangeRate: rate, baseAmount: toBase(t.amount, rate), supplierId: r.supplierId, notes: `${r.name}: ${t.description}` } });
    } else {
      const taxRows = t.taxTypeIds.length ? await tx.taxType.findMany({ where: { companyId: r.companyId, id: { in: t.taxTypeIds }, transactionType: "PURCHASES" } }) : [];
      const specs: TaxSpec[] = taxRows.map((x) => ({ taxTypeId: x.id, name: x.name, calculationType: x.calculationType, percent: x.percent, fixedAmount: x.fixedAmount === null ? null : Number(x.fixedAmount), compound: x.compound }));
      const result = computeBill([{ expenseCategoryId: t.expenseCategoryId, description: t.description, quantity: 1, price: t.amount, discountType: "PERCENTAGE", discount: 0, taxes: specs }], false, rate);
      const next = await nextPurchaseNumber(r.companyId, "bill", tx);
      const line = result.lines[0];
      await tx.bill.create({
        data: {
          companyId: r.companyId,
          creatorId: r.creatorId,
          supplierId: r.supplierId,
          type: "BILL",
          number: next.number,
          sequenceNumber: next.sequence,
          reference: r.name,
          status: r.createAsDraft ? "DRAFT" : "OPEN",
          documentDate: date,
          dueDate: parseIsoDate(addDaysIso(runDate, r.dueDays)),
          currency,
          exchangeRate: rate,
          subTotal: result.subTotal,
          tax: result.tax,
          total: result.total,
          baseTotal: result.baseTotal,
          dueAmount: result.total,
          baseDueAmount: result.baseTotal,
          supplierSnapshot: snapshot(r.supplier),
          lines: {
            create: [
              {
                position: 0,
                expenseCategoryId: t.expenseCategoryId,
                description: t.description,
                quantity: 1,
                price: t.amount,
                subTotal: line.subTotal,
                discountVal: 0,
                tax: line.tax,
                total: line.total,
                baseTotal: line.baseTotal,
                taxes: { create: line.taxes.map((x) => ({ taxTypeId: x.taxTypeId, name: x.name, calculationType: x.calculationType, percent: x.percent, fixedAmount: x.fixedAmount, compound: x.compound, amount: x.amount, baseAmount: x.baseAmount })) },
              },
            ],
          },
        },
      });
    }
    const runs = r.runCount + 1;
    const nextRun = nextOccurrence(r.frequency, r.nextRunAt > now ? r.nextRunAt : now, tz);
    const done = (r.limitBy === "COUNT" && r.limitCount !== null && runs >= r.limitCount) || !nextRun;
    await tx.recurringCost.update({ where: { id }, data: { runCount: runs, lastRunAt: now, lastError: null, nextRunAt: done ? null : nextRun, status: done ? "COMPLETED" : "ACTIVE" } });
    return true;
  });
}

// ---- reporting ---------------------------------------------------------------------------

/** Purchases report (spec §8): bills, credits, payments and refunds dated in range, totals by supplier and status. */
export async function purchasesReport(companyId: number, from: string, to: string) {
  const range = { gte: parseIsoDate(from)!, lte: parseIsoDate(to)! };
  const [bills, payments, suppliers, open] = await Promise.all([
    db.bill.findMany({ where: { companyId, documentDate: range }, select: { supplierId: true, type: true, status: true, baseTotal: true } }),
    db.supplierPayment.findMany({ where: { companyId, paymentDate: range, status: "OPEN" }, select: { supplierId: true, type: true, baseAmount: true } }),
    db.supplier.findMany({ where: { companyId }, select: { id: true, name: true } }),
    db.bill.findMany({ where: { companyId, type: "BILL", status: "OPEN", dueAmount: { gt: 0 } }, select: { dueDate: true, baseDueAmount: true } }),
  ]);
  const name = new Map(suppliers.map((s) => [s.id, s.name]));
  type Row = { supplier: string; bills: number; credits: number; payments: number; refunds: number; draft: number; open: number; void: number };
  const rows = new Map<number, Row>();
  const row = (id: number) => {
    if (!rows.has(id)) rows.set(id, { supplier: name.get(id) ?? "Unknown supplier", bills: 0, credits: 0, payments: 0, refunds: 0, draft: 0, open: 0, void: 0 });
    return rows.get(id)!;
  };
  for (const b of bills) {
    const r = row(b.supplierId);
    const v = Number(b.baseTotal);
    if (b.status === "VOID") r.void += v;
    else if (b.type === "BILL") {
      r.bills += v;
      if (b.status === "DRAFT") r.draft += v;
      else r.open += v;
    } else r.credits += v;
  }
  for (const p of payments) {
    const r = row(p.supplierId);
    if (p.type === "PAYMENT") r.payments += Number(p.baseAmount);
    else r.refunds += Number(p.baseAmount);
  }
  const list = [...rows.values()].sort((a, b) => a.supplier.localeCompare(b.supplier));
  const totals = list.reduce((t, r) => ({ bills: t.bills + r.bills, credits: t.credits + r.credits, payments: t.payments + r.payments, refunds: t.refunds + r.refunds }), { bills: 0, credits: 0, payments: 0, refunds: 0 });
  return { rows: list, totals, open: open.map((b) => ({ dueDate: b.dueDate ? isoDate(b.dueDate) : null, baseDue: Number(b.baseDueAmount) })) };
}

/** Supplier payments (+) and refunds (−) in base currency for profit & loss and cash flow (spec §8, §5.1). */
export async function supplierCashTotals(companyId: number, from: Date, to: Date) {
  const rows = await db.supplierPayment.groupBy({ by: ["type"], where: { companyId, status: "OPEN", paymentDate: { gte: from, lte: to } }, _sum: { baseAmount: true } });
  const sum = (t: "PAYMENT" | "REFUND") => Number(rows.find((r) => r.type === t)?._sum.baseAmount ?? 0);
  return { payments: sum("PAYMENT"), refunds: sum("REFUND") };
}
