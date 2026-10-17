import { cleanRichText } from "@/lib/sanitize-html";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import type { FieldErrors } from "@/lib/action";
import { randomToken } from "@/lib/auth/tokens";
import { addDaysIso, isoDate, parseIsoDate, todayIn, zonedParts } from "@/lib/dates";
import { toBase } from "@/lib/money";
import { copyCustomFieldAnswers, saveCustomFieldAnswers, validateCustomFieldAnswers } from "@/lib/custom-fields";
import { invoiceAllowEdit, mapTemplate, recomputeBalance } from "@/domain/status";
import { computeCreditNote, type CreditSource } from "@/domain/credit";
import { buildDocument, copyLines, logExchangeRate, totalsData, writeLines, type DocumentInput } from "./documents";
import { nextNumber } from "./numbers";

export type Result = { ok: true; id: number } | { ok: false; error: string; fieldErrors?: FieldErrors; status?: number };

export const INVOICE_TEMPLATES = ["invoice1", "invoice2", "invoice3"];

/** Recomputes balance + statuses of an invoice from allocations and credit notes (spec §4.5). */
export async function recalcInvoice(tx: Tx, invoiceId: number) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv || inv.type !== "INVOICE") return;
  const [paid, credited] = await Promise.all([
    tx.paymentAllocation.aggregate({ where: { invoiceId }, _sum: { amount: true } }),
    tx.invoice.aggregate({ where: { relatedInvoiceId: invoiceId, type: "CREDIT_NOTE" }, _sum: { total: true } }),
  ]);
  const r = recomputeBalance({
    total: Number(inv.total),
    paid: Number(paid._sum.amount ?? 0),
    credited: Math.abs(Number(credited._sum.total ?? 0)),
    status: inv.status,
    sent: inv.sent,
    viewed: inv.viewed,
    overdue: inv.overdue,
  });
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { dueAmount: r.dueAmount, baseDueAmount: toBase(r.dueAmount, inv.exchangeRate), paidStatus: r.paidStatus, status: r.status, overdue: r.overdue },
  });
}

export async function invoicePaidAmount(invoiceId: number, tx: Tx = db) {
  const a = await tx.paymentAllocation.aggregate({ where: { invoiceId }, _sum: { amount: true } });
  return Number(a._sum.amount ?? 0);
}

export async function saveInvoice(ctx: CompanyContext, id: number | null, input: DocumentInput, cfSource: FormData | Record<string, unknown>, send = false): Promise<Result> {
  const existing = id ? await db.invoice.findFirst({ where: { id, companyId: ctx.companyId, type: "INVOICE" }, include: { _count: { select: { creditNotes: true } } } }) : null;
  if (id && !existing) return { ok: false, error: "Invoice not found.", status: 404 };
  if (existing && !invoiceAllowEdit(existing.paidStatus, existing._count.creditNotes > 0, ctx.settings.retrospective_edits)) {
    return { ok: false, error: "This invoice can no longer be edited.", status: 403 };
  }
  const modes = existing
    ? { taxPerItem: existing.taxPerItem, discountPerItem: existing.discountPerItem }
    : { taxPerItem: ctx.settings.tax_per_item === "YES", discountPerItem: ctx.settings.discount_per_item === "YES" };
  const built = await buildDocument(ctx, input, modes, { requireDate: true });
  if (!built.ok) return built;
  const doc = built.doc;
  const cf = await validateCustomFieldAnswers(ctx.companyId, "Invoice", cfSource, todayIn(ctx.settings.time_zone));
  if (!cf.ok) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: cf.errors };

  const paid = existing ? await invoicePaidAmount(existing.id) : 0;
  if (existing && paid > 0 && existing.customerId !== doc.customer.id) {
    return { ok: false, error: "The customer cannot be changed after a payment is added.", fieldErrors: { customerId: ["customer_cannot_be_changed_after_payment_is_added"] } };
  }
  if (existing && doc.result.total < paid) {
    return { ok: false, error: "The invoice total must be at least the amount already paid.", fieldErrors: { total: ["total_invoice_amount_must_be_more_than_paid_amount"] } };
  }
  const template = input.templateName && INVOICE_TEMPLATES.includes(input.templateName) ? input.templateName : existing?.templateName ?? ctx.settings.default_invoice_template ?? "invoice1";

  try {
    const saved = await db.$transaction(async (tx) => {
      const suggestion = !existing || existing.customerId !== doc.customer.id ? await nextNumber(ctx.companyId, "invoice", doc.customer.id, tx) : null;
      const number = input.number || existing?.invoiceNumber || suggestion!.number;
      const dup = await tx.invoice.findFirst({ where: { companyId: ctx.companyId, invoiceNumber: number, NOT: existing ? { id: existing.id } : undefined } });
      if (dup) throw new DomainError("Invoice number already in use.", { number: ["This number is already used by another invoice."] });
      const data = {
        customerId: doc.customer.id,
        invoiceNumber: number,
        referenceNumber: input.referenceNumber || null,
        invoiceDate: doc.date!,
        invoiceTime: ctx.settings.invoice_use_time === "YES" ? (doc.time ?? existing?.invoiceTime ?? nowTimeIn(ctx.settings.time_zone)) : null,
        dueDate: doc.closingDate,
        templateName: template,
        notes: cleanRichText(input.notes),
        ...totalsData(doc),
        baseSubTotal: doc.result.baseSubTotal,
        baseDiscountVal: doc.result.baseDiscountVal,
        baseTax: doc.result.baseTax,
        baseTotal: doc.result.baseTotal,
      };
      let inv;
      if (existing) {
        inv = await tx.invoice.update({
          where: { id: existing.id },
          data: { ...data, ...(suggestion ? { customerSequenceNumber: suggestion.customerSequence } : {}) },
        });
      } else {
        inv = await tx.invoice.create({
          data: {
            ...data,
            companyId: ctx.companyId,
            creatorId: ctx.user.id,
            sequenceNumber: suggestion!.sequence,
            customerSequenceNumber: suggestion!.customerSequence,
            status: send ? "SENT" : "DRAFT",
            dueAmount: doc.result.total,
            baseDueAmount: doc.result.baseTotal,
            uniqueHash: randomToken(24),
          },
        });
      }
      await writeLines(tx, ctx.companyId, { invoiceId: inv.id }, doc);
      await saveCustomFieldAnswers(tx, ctx.companyId, "Invoice", inv.id, cf.values);
      await logExchangeRate(tx, ctx.companyId, doc.customer.currency, ctx.settings.currency, doc.exchangeRate);
      await recalcInvoice(tx, inv.id);
      return inv;
    });
    return { ok: true, id: saved.id };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
}

export class DomainError extends Error {
  constructor(message: string, public fieldErrors?: FieldErrors, public code?: string) {
    super(message);
  }
}

/** Deletes invoices / credit notes. Refuses invoices with payment allocations (spec §3.9.2). */
export async function deleteInvoices(ctx: CompanyContext, ids: number[]): Promise<{ deleted: number; blocked: string[] }> {
  const invs = await db.invoice.findMany({ where: { id: { in: ids }, companyId: ctx.companyId }, include: { _count: { select: { allocations: true } } } });
  const blocked: string[] = [];
  let deleted = 0;
  for (const inv of invs) {
    if (inv._count.allocations > 0) {
      blocked.push(inv.invoiceNumber);
      continue;
    }
    await db.$transaction(async (tx) => {
      await tx.customFieldValue.deleteMany({ where: { modelType: "Invoice", modelId: inv.id } });
      await tx.invoice.delete({ where: { id: inv.id } });
      if (inv.type === "CREDIT_NOTE" && inv.relatedInvoiceId) await recalcInvoice(tx, inv.relatedInvoiceId);
    });
    deleted++;
  }
  return { deleted, blocked };
}

export async function markInvoiceSent(ctx: CompanyContext, id: number): Promise<Result> {
  const inv = await db.invoice.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!inv) return { ok: false, error: "Invoice not found.", status: 404 };
  if (inv.status !== "DRAFT") return { ok: false, error: "Only draft invoices can be marked as sent." };
  await db.invoice.update({ where: { id }, data: { status: "SENT", sent: true } });
  return { ok: true, id };
}

export async function markInvoiceCompleted(ctx: CompanyContext, id: number): Promise<Result> {
  const inv = await db.invoice.findFirst({ where: { id, companyId: ctx.companyId, type: "INVOICE" } });
  if (!inv) return { ok: false, error: "Invoice not found.", status: 404 };
  const paid = await invoicePaidAmount(id);
  const credited = await db.invoice.aggregate({ where: { relatedInvoiceId: id }, _sum: { total: true } });
  if (Number(inv.total) - paid - Math.abs(Number(credited._sum.total ?? 0)) !== 0 || Number(inv.dueAmount) !== 0) {
    return { ok: false, error: "The invoice must be settled before it can be completed.", fieldErrors: { status: ["invoice_must_be_settled_before_completion"] } };
  }
  await db.invoice.update({ where: { id }, data: { status: "COMPLETED", paidStatus: "PAID", overdue: false } });
  return { ok: true, id };
}

function dueFor(ctx: CompanyContext, date: string): Date | null {
  if (ctx.settings.invoice_set_due_date_automatically !== "YES") return null;
  return parseIsoDate(addDaysIso(date, Number(ctx.settings.invoice_due_date_days) || 7));
}

/** Clone (spec §4.7): new DRAFT copy dated today, next number. */
export async function cloneInvoice(ctx: CompanyContext, id: number): Promise<Result> {
  const src = await db.invoice.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!src) return { ok: false, error: "Invoice not found.", status: 404 };
  if (src.type === "CREDIT_NOTE") return { ok: false, error: "A credit note cannot be cloned." };
  const today = todayIn(ctx.settings.time_zone);
  const inv = await db.$transaction(async (tx) => {
    const n = await nextNumber(ctx.companyId, "invoice", src.customerId, tx);
    const { id: _id, uniqueHash: _h, createdAt: _c, updatedAt: _u, ...rest } = src;
    void _id; void _h; void _c; void _u;
    const created = await tx.invoice.create({
      data: {
        ...rest,
        creatorId: ctx.user.id,
        invoiceNumber: n.number,
        sequenceNumber: n.sequence,
        customerSequenceNumber: n.customerSequence,
        invoiceDate: parseIsoDate(today)!,
        invoiceTime: ctx.settings.invoice_use_time === "YES" ? nowTimeIn(ctx.settings.time_zone) : null,
        dueDate: dueFor(ctx, today),
        status: "DRAFT",
        paidStatus: "UNPAID",
        overdue: false,
        sent: false,
        viewed: false,
        dueAmount: src.total,
        baseDueAmount: src.baseTotal,
        recurringInvoiceId: null,
        uniqueHash: randomToken(24),
      },
    });
    await copyLines(tx, ctx.companyId, { invoiceId: src.id }, { invoiceId: created.id });
    await copyCustomFieldAnswers(tx, { modelType: "Invoice", modelId: src.id }, { modelType: "Invoice", modelId: created.id });
    return created;
  });
  return { ok: true, id: inv.id };
}

/** Convert invoice -> estimate (spec §4.7). */
export async function convertInvoiceToEstimate(ctx: CompanyContext, id: number): Promise<Result> {
  const src = await db.invoice.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!src) return { ok: false, error: "Invoice not found.", status: 404 };
  if (src.type === "CREDIT_NOTE") return { ok: false, error: "A credit note cannot be converted to an estimate." };
  const today = todayIn(ctx.settings.time_zone);
  const est = await db.$transaction(async (tx) => {
    const n = await nextNumber(ctx.companyId, "estimate", src.customerId, tx);
    const created = await tx.estimate.create({
      data: {
        companyId: ctx.companyId,
        creatorId: ctx.user.id,
        customerId: src.customerId,
        estimateNumber: n.number,
        sequenceNumber: n.sequence,
        customerSequenceNumber: n.customerSequence,
        referenceNumber: src.invoiceNumber,
        estimateDate: parseIsoDate(today)!,
        expiryDate: parseIsoDate(addDaysIso(today, 30)),
        currency: src.currency,
        exchangeRate: src.exchangeRate,
        taxPerItem: src.taxPerItem,
        discountPerItem: src.discountPerItem,
        taxIncluded: src.taxIncluded,
        discountType: src.discountType,
        discount: src.discount,
        discountVal: src.discountVal,
        subTotal: src.subTotal,
        tax: src.tax,
        total: src.total,
        baseSubTotal: src.baseSubTotal,
        baseDiscountVal: src.baseDiscountVal,
        baseTax: src.baseTax,
        baseTotal: src.baseTotal,
        notes: src.notes,
        templateName: mapTemplate(src.templateName, "estimate"),
        uniqueHash: randomToken(24),
      },
    });
    await copyLines(tx, ctx.companyId, { invoiceId: src.id }, { estimateId: created.id });
    await copyCustomFieldAnswers(tx, { modelType: "Invoice", modelId: src.id }, { modelType: "Estimate", modelId: created.id });
    return created;
  });
  return { ok: true, id: est.id };
}

/** Credit quantities already credited per original line. */
export async function creditedQuantities(invoiceId: number, tx: Tx = db) {
  const lines = await tx.lineItem.findMany({ where: { invoice: { relatedInvoiceId: invoiceId, type: "CREDIT_NOTE" } }, select: { sourceLineId: true, quantity: true } });
  const map = new Map<number, number>();
  for (const l of lines) if (l.sourceLineId) map.set(l.sourceLineId, Math.round(((map.get(l.sourceLineId) ?? 0) + l.quantity) * 100) / 100);
  return map;
}

/** Create a (partial) credit note, spec §3.9.3 / §4.8. */
export async function createCreditNote(ctx: CompanyContext, invoiceId: number, reason: string | null, request: Map<number, number>): Promise<Result> {
  try {
    const cn = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
      const inv = await tx.invoice.findFirst({ where: { id: invoiceId, companyId: ctx.companyId }, include: { lines: { include: { taxes: true }, orderBy: { position: "asc" } }, taxes: { where: { lineItemId: null } } } });
      if (!inv) throw new DomainError("Invoice not found.");
      if (inv.type === "CREDIT_NOTE") throw new DomainError("A credit note cannot be created from a credit note.", undefined, "a_credit_note_cannot_be_created_from_a_credit_note");
      if (inv.status === "DRAFT") throw new DomainError("A draft invoice cannot be credited.", undefined, "a_draft_invoice_cannot_be_credited");
      const paid = await invoicePaidAmount(inv.id, tx);
      const creditedAgg = await tx.invoice.aggregate({ where: { relatedInvoiceId: inv.id }, _sum: { total: true } });
      const credited = Math.abs(Number(creditedAgg._sum.total ?? 0));
      const src: CreditSource = {
        subTotal: Number(inv.subTotal),
        discountVal: Number(inv.discountVal),
        total: Number(inv.total),
        taxPerItem: inv.taxPerItem,
        discountPerItem: inv.discountPerItem,
        taxIncluded: inv.taxIncluded,
        taxes: inv.taxes.map((t) => ({ key: String(t.id), name: t.name, amount: Number(t.amount) })),
        lines: inv.lines.map((l) => ({ id: l.id, quantity: l.quantity, price: Number(l.price), discountVal: Number(l.discountVal), taxes: l.taxes.map((t) => ({ key: String(t.id), name: t.name, amount: Number(t.amount) })) })),
        paid,
        credited,
      };
      const r = computeCreditNote(src, await creditedQuantities(inv.id, tx), request);
      if (!r.ok) throw new DomainError(CREDIT_ERRORS[r.error] ?? r.error, undefined, r.error);
      const n = await nextNumber(ctx.companyId, "credit_note", inv.customerId, tx);
      const rate = inv.exchangeRate;
      const created = await tx.invoice.create({
        data: {
          companyId: ctx.companyId,
          creatorId: ctx.user.id,
          customerId: inv.customerId,
          type: "CREDIT_NOTE",
          invoiceNumber: n.number,
          sequenceNumber: n.sequence,
          customerSequenceNumber: n.customerSequence,
          referenceNumber: inv.invoiceNumber,
          invoiceDate: parseIsoDate(todayIn(ctx.settings.time_zone))!,
          invoiceTime: ctx.settings.invoice_use_time === "YES" ? nowTimeIn(ctx.settings.time_zone) : null,
          dueDate: null,
          currency: inv.currency,
          exchangeRate: rate,
          status: "DRAFT",
          paidStatus: "PAID",
          taxPerItem: inv.taxPerItem,
          discountPerItem: inv.discountPerItem,
          taxIncluded: inv.taxIncluded,
          discountType: inv.discountType,
          discount: inv.discount,
          discountVal: -r.discountVal,
          subTotal: -r.subTotal,
          tax: -r.tax,
          total: -r.total,
          dueAmount: 0,
          baseDiscountVal: -toBase(r.discountVal, rate),
          baseSubTotal: -toBase(r.subTotal, rate),
          baseTax: -toBase(r.tax, rate),
          baseTotal: -toBase(r.total, rate),
          baseDueAmount: 0,
          notes: inv.notes,
          templateName: inv.templateName,
          relatedInvoiceId: inv.id,
          creditReason: reason,
          uniqueHash: randomToken(24),
        },
      });
      for (const [pos, cl] of r.lines.entries()) {
        const orig = inv.lines.find((l) => l.id === cl.id)!;
        const line = await tx.lineItem.create({
          data: {
            companyId: ctx.companyId,
            invoiceId: created.id,
            position: pos,
            itemId: orig.itemId,
            name: orig.name,
            description: orig.description,
            unitName: orig.unitName,
            quantity: cl.quantity,
            price: -Number(orig.price),
            discountType: orig.discountType,
            discount: orig.discount,
            discountVal: -cl.discountVal,
            tax: -cl.taxes.reduce((s, t) => s + t.amount, 0),
            total: -cl.total,
            basePrice: -toBase(Number(orig.price), rate),
            baseDiscountVal: -toBase(cl.discountVal, rate),
            baseTax: -toBase(cl.taxes.reduce((s, t) => s + t.amount, 0), rate),
            baseTotal: -toBase(cl.total, rate),
            exchangeRate: rate,
            sourceLineId: orig.id,
            customFields: orig.customFields ?? Prisma.DbNull,
          },
        });
        for (const [j, t] of cl.taxes.entries()) {
          const o = orig.taxes.find((x) => String(x.id) === t.key)!;
          await tx.appliedTax.create({
            data: { companyId: ctx.companyId, lineItemId: line.id, position: j, taxTypeId: o.taxTypeId, name: o.name, calculationType: o.calculationType, percent: o.percent, fixedAmount: o.fixedAmount, compound: o.compound, amount: -t.amount, baseAmount: -toBase(t.amount, rate) },
          });
        }
      }
      for (const [j, t] of r.taxes.entries()) {
        const o = inv.taxes.find((x) => String(x.id) === t.key)!;
        await tx.appliedTax.create({
          data: { companyId: ctx.companyId, invoiceId: created.id, position: j, taxTypeId: o.taxTypeId, name: o.name, calculationType: o.calculationType, percent: o.percent, fixedAmount: o.fixedAmount, compound: o.compound, amount: -t.amount, baseAmount: -toBase(t.amount, rate) },
        });
      }
      await copyCustomFieldAnswers(tx, { modelType: "Invoice", modelId: inv.id }, { modelType: "Invoice", modelId: created.id });
      await recalcInvoice(tx, inv.id);
      return created;
    });
    return { ok: true, id: cn.id };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, fieldErrors: e.code ? { credit: [e.code] } : undefined };
    throw e;
  }
}

const CREDIT_ERRORS: Record<string, string> = {
  invoice_already_fully_credited: "This invoice is already fully credited.",
  credit_quantity_exceeds_remaining: "A credit quantity exceeds the remaining quantity.",
  credit_note_must_credit_something: "Enter a quantity to credit on at least one line.",
  credit_amount_exceeds_invoice_balance: "The credit amount exceeds the unpaid balance. Remove or reduce payments first.",
};

export function isoOrNull(d: Date | null | undefined) {
  return d ? isoDate(d) : null;
}

/** Current wall-clock time "HH:MM" in a zone (invoice_use_time default, spec §4.4). */
export function nowTimeIn(timeZone: string, now = new Date()) {
  const p = zonedParts(now, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
