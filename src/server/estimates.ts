import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import { randomToken } from "@/lib/auth/tokens";
import { addDaysIso, parseIsoDate, todayIn } from "@/lib/dates";
import { copyCustomFieldAnswers, saveCustomFieldAnswers, validateCustomFieldAnswers } from "@/lib/custom-fields";
import { estimateTransitions, mapTemplate } from "@/domain/status";
import { renderNumber } from "@/domain/numbering";
import { buildDocument, copyLines, logExchangeRate, totalsData, writeLines, type DocumentInput } from "./documents";
import { nextNumber } from "./numbers";
import { DomainError, recalcInvoice, type Result } from "./invoices";

export const ESTIMATE_TEMPLATES = ["estimate1", "estimate2", "estimate3"];

export async function saveEstimate(ctx: CompanyContext, id: number | null, input: DocumentInput, cfSource: FormData | Record<string, unknown>, send = false): Promise<Result> {
  const existing = id ? await db.estimate.findFirst({ where: { id, companyId: ctx.companyId } }) : null;
  if (id && !existing) return { ok: false, error: "Estimate not found.", status: 404 };
  const modes = existing
    ? { taxPerItem: existing.taxPerItem, discountPerItem: existing.discountPerItem }
    : { taxPerItem: ctx.settings.tax_per_item === "YES", discountPerItem: ctx.settings.discount_per_item === "YES" };
  const built = await buildDocument(ctx, input, modes, { requireDate: true });
  if (!built.ok) return built;
  const doc = built.doc;
  const cf = await validateCustomFieldAnswers(ctx.companyId, "Estimate", cfSource, todayIn(ctx.settings.time_zone));
  if (!cf.ok) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: cf.errors };
  const template = input.templateName && ESTIMATE_TEMPLATES.includes(input.templateName) ? input.templateName : existing?.templateName ?? ctx.settings.default_estimate_template ?? "estimate1";
  try {
    const saved = await db.$transaction(async (tx) => {
      const suggestion = !existing || existing.customerId !== doc.customer.id ? await nextNumber(ctx.companyId, "estimate", doc.customer.id, tx) : null;
      const number = input.number || existing?.estimateNumber || suggestion!.number;
      if (await tx.estimate.findFirst({ where: { companyId: ctx.companyId, estimateNumber: number, NOT: existing ? { id: existing.id } : undefined } })) {
        throw new DomainError("Estimate number already in use.", { number: ["This number is already used by another estimate."] });
      }
      const data = {
        customerId: doc.customer.id,
        estimateNumber: number,
        referenceNumber: input.referenceNumber || null,
        estimateDate: doc.date!,
        expiryDate: doc.closingDate,
        templateName: template,
        notes: input.notes || null,
        ...totalsData(doc),
        baseSubTotal: doc.result.baseSubTotal,
        baseDiscountVal: doc.result.baseDiscountVal,
        baseTax: doc.result.baseTax,
        baseTotal: doc.result.baseTotal,
      };
      const est = existing
        ? await tx.estimate.update({ where: { id: existing.id }, data: { ...data, ...(suggestion ? { customerSequenceNumber: suggestion.customerSequence } : {}) } })
        : await tx.estimate.create({
            data: {
              ...data,
              companyId: ctx.companyId,
              creatorId: ctx.user.id,
              sequenceNumber: suggestion!.sequence,
              customerSequenceNumber: suggestion!.customerSequence,
              status: send ? "SENT" : "DRAFT",
              uniqueHash: randomToken(24),
            },
          });
      await writeLines(tx, ctx.companyId, { estimateId: est.id }, doc);
      await saveCustomFieldAnswers(tx, ctx.companyId, "Estimate", est.id, cf.values);
      await logExchangeRate(tx, ctx.companyId, doc.customer.currency, ctx.settings.currency, doc.exchangeRate);
      return est;
    });
    return { ok: true, id: saved.id };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
}

export async function deleteEstimates(ctx: CompanyContext, ids: number[]) {
  const owned = (await db.estimate.findMany({ where: { id: { in: ids }, companyId: ctx.companyId }, select: { id: true } })).map((e) => e.id);
  await db.customFieldValue.deleteMany({ where: { modelType: "Estimate", modelId: { in: owned } } });
  const res = await db.estimate.deleteMany({ where: { id: { in: owned } } });
  return res.count;
}

export async function setEstimateStatus(ctx: CompanyContext, id: number, status: "SENT" | "ACCEPTED" | "REJECTED"): Promise<Result> {
  const est = await db.estimate.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!est) return { ok: false, error: "Estimate not found.", status: 404 };
  if (status === "SENT" && !estimateTransitions.markSent(est.status)) return { ok: false, error: "The estimate is already marked as sent." };
  if ((status === "ACCEPTED" || status === "REJECTED") && !estimateTransitions.canDecide(est.status)) return { ok: false, error: "This estimate was already accepted or rejected." };
  await db.estimate.update({ where: { id }, data: { status } });
  return { ok: true, id };
}

export async function cloneEstimate(ctx: CompanyContext, id: number): Promise<Result> {
  const src = await db.estimate.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!src) return { ok: false, error: "Estimate not found.", status: 404 };
  const today = todayIn(ctx.settings.time_zone);
  const auto = ctx.settings.estimate_set_expiry_date_automatically === "YES";
  const est = await db.$transaction(async (tx) => {
    const n = await nextNumber(ctx.companyId, "estimate", src.customerId, tx);
    const { id: _i, uniqueHash: _h, createdAt: _c, updatedAt: _u, ...rest } = src;
    void _i; void _h; void _c; void _u;
    const created = await tx.estimate.create({
      data: {
        ...rest,
        creatorId: ctx.user.id,
        estimateNumber: n.number,
        sequenceNumber: n.sequence,
        customerSequenceNumber: n.customerSequence,
        estimateDate: parseIsoDate(today)!,
        expiryDate: auto ? parseIsoDate(addDaysIso(today, Number(ctx.settings.estimate_expiry_date_days) || 7)) : null,
        status: "DRAFT",
        uniqueHash: randomToken(24),
      },
    });
    await copyLines(tx, ctx.companyId, { estimateId: src.id }, { estimateId: created.id });
    await copyCustomFieldAnswers(tx, { modelType: "Estimate", modelId: src.id }, { modelType: "Estimate", modelId: created.id });
    return created;
  });
  return { ok: true, id: est.id };
}

/** Convert estimate -> invoice, then apply estimate_convert_action (spec §4.7). */
export async function convertEstimateToInvoice(ctx: CompanyContext, id: number): Promise<Result> {
  const src = await db.estimate.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!src) return { ok: false, error: "Estimate not found.", status: 404 };
  if (!estimateTransitions.canConvert(src.status)) return { ok: false, error: "A rejected estimate cannot be converted." };
  const today = todayIn(ctx.settings.time_zone);
  const auto = ctx.settings.invoice_set_due_date_automatically === "YES";
  const inv = await db.$transaction(async (tx) => {
    const n = await nextNumber(ctx.companyId, "invoice", src.customerId, tx);
    const created = await tx.invoice.create({
      data: {
        companyId: ctx.companyId,
        creatorId: ctx.user.id,
        customerId: src.customerId,
        invoiceNumber: n.number,
        sequenceNumber: n.sequence,
        customerSequenceNumber: n.customerSequence,
        referenceNumber: renderNumber(ctx.settings.invoice_number_format, { sequence: n.sequence, customerSequence: n.customerSequence }),
        invoiceDate: parseIsoDate(today)!,
        dueDate: auto ? parseIsoDate(addDaysIso(today, Number(ctx.settings.invoice_due_date_days) || 7)) : null,
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
        dueAmount: src.total,
        baseSubTotal: src.baseSubTotal,
        baseDiscountVal: src.baseDiscountVal,
        baseTax: src.baseTax,
        baseTotal: src.baseTotal,
        baseDueAmount: src.baseTotal,
        notes: src.notes,
        templateName: mapTemplate(src.templateName, "invoice"),
        uniqueHash: randomToken(24),
      },
    });
    await copyLines(tx, ctx.companyId, { estimateId: src.id }, { invoiceId: created.id });
    await copyCustomFieldAnswers(tx, { modelType: "Estimate", modelId: src.id }, { modelType: "Invoice", modelId: created.id });
    await recalcInvoice(tx, created.id);
    const action = ctx.settings.estimate_convert_action;
    if (action === "mark_estimate_as_accepted") await tx.estimate.update({ where: { id: src.id }, data: { status: "ACCEPTED" } });
    if (action === "delete_estimate") {
      await tx.customFieldValue.deleteMany({ where: { modelType: "Estimate", modelId: src.id } });
      await tx.estimate.delete({ where: { id: src.id } });
    }
    return created;
  });
  return { ok: true, id: inv.id };
}
