import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import type { FieldErrors } from "@/lib/action";
import { MAX_MONEY, toMinor, roundTo } from "@/lib/money";
import { parseIsoDate } from "@/lib/dates";
import { computeDocument, type DocumentResult, type TaxSpec } from "@/domain/totals";
import { getCustomFields, lineFieldsFrom, normalizeLineAnswers } from "@/lib/custom-fields";
import { todayIn } from "@/lib/dates";


/** Shared document payload (invoice, estimate, recurring invoice). Money in major units unless `minor`. */
export const lineSchema = z.object({
  itemId: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1, "Enter an item name.").max(255),
  description: z.string().max(65000).nullable().optional(),
  unitName: z.string().max(255).nullable().optional(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0.").max(1e9),
  price: z.union([z.string(), z.number()]),
  discountType: z.enum(["FIXED", "PERCENTAGE"]).default("FIXED"),
  discount: z.union([z.string(), z.number()]).optional().default(0),
  taxes: z.array(z.coerce.number().int().positive()).default([]),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable().optional(),
});

export const documentSchema = z.object({
  customerId: z.coerce.number({ invalid_type_error: "Choose a customer." }).int().positive("Choose a customer."),
  date: z.string().optional().default(""),
  /** "HH:MM" for invoices when invoice_use_time = YES. */
  time: z.string().nullable().optional(),
  closingDate: z.string().nullable().optional(),
  number: z.string().trim().max(255).optional().default(""),
  referenceNumber: z.string().trim().max(255).nullable().optional(),
  exchangeRate: z.union([z.string(), z.number()]).optional(),
  discountType: z.enum(["FIXED", "PERCENTAGE"]).default("FIXED"),
  discount: z.union([z.string(), z.number()]).optional().default(0),
  taxIncluded: z.boolean().optional().default(false),
  notes: z.string().max(65000).nullable().optional(),
  templateName: z.string().max(40).optional(),
  taxes: z.array(z.coerce.number().int().positive()).default([]),
  lines: z.array(lineSchema).min(1, "Add at least one line item."),
  minor: z.boolean().optional(),
});

export type DocumentInput = z.infer<typeof documentSchema>;

export type Built = {
  customer: { id: number; currency: string; name: string };
  date: Date | null;
  time: string | null;
  closingDate: Date | null;
  exchangeRate: number;
  taxPerItem: boolean;
  discountPerItem: boolean;
  taxIncluded: boolean;
  discountType: "FIXED" | "PERCENTAGE";
  discount: number;
  result: DocumentResult;
  lines: (z.infer<typeof lineSchema> & { priceMinor: number; discountStored: number; specs: TaxSpec[]; cfValues: Record<string, string> | null })[];
  docSpecs: TaxSpec[];
};

export type BuildResult = { ok: true; doc: Built } | { ok: false; error: string; fieldErrors?: FieldErrors; status?: number };

function toSpec(t: { id: number; name: string; calculationType: "PERCENTAGE" | "FIXED"; percent: number | null; fixedAmount: bigint | null; compound: boolean }): TaxSpec {
  return { taxTypeId: t.id, name: t.name, calculationType: t.calculationType, percent: t.percent, fixedAmount: t.fixedAmount === null ? null : Number(t.fixedAmount), compound: t.compound };
}

/**
 * Validates and computes a document server-side (spec §4.1: server is authoritative).
 * `modes` freezes tax/discount layout (company settings on create, the document's own on edit).
 */
export async function buildDocument(
  ctx: CompanyContext,
  input: DocumentInput,
  modes: { taxPerItem: boolean; discountPerItem: boolean },
  opts: { requireDate: boolean },
): Promise<BuildResult> {
  const errors: FieldErrors = {};
  const customer = await db.customer.findFirst({ where: { id: input.customerId, companyId: ctx.companyId }, select: { id: true, currency: true, name: true } });
  if (!customer) return { ok: false, error: "Choose a customer.", fieldErrors: { customerId: ["Choose a customer."] } };

  const date = input.date ? parseIsoDate(input.date) : null;
  if (opts.requireDate && !date) errors.date = ["Enter a valid date."];
  const closingDate = input.closingDate ? parseIsoDate(input.closingDate) : null;
  if (input.closingDate && !closingDate) errors.closingDate = ["Enter a valid date."];
  if (date && closingDate && closingDate < date) errors.closingDate = ["Must be on or after the document date."];
  const time = input.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) ? input.time : null;
  if (input.time && !time) errors.time = ["Enter a time as HH:MM."];

  const lineFields = lineFieldsFrom(await getCustomFields(ctx.companyId, "Item"));
  const today = todayIn(ctx.settings.time_zone);

  const foreign = customer.currency !== ctx.settings.currency;
  let exchangeRate = 1;
  if (foreign) {
    exchangeRate = roundTo(Number(input.exchangeRate), 6);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) errors.exchangeRate = ["Enter the exchange rate."];
  }

  const money = (v: string | number | undefined) => (input.minor ? Math.round(Number(v ?? 0)) : toMinor(v ?? 0));

  const taxIds = [...new Set([...input.taxes, ...input.lines.flatMap((l) => l.taxes)])];
  const taxTypes = taxIds.length
    ? await db.taxType.findMany({ where: { id: { in: taxIds }, companyId: ctx.companyId, transactionType: "SALES" } })
    : [];
  const byId = new Map(taxTypes.map((t) => [t.id, toSpec(t)]));
  const specsFor = (ids: number[], key: string): TaxSpec[] => {
    if (new Set(ids).size !== ids.length) errors[key] = ["A tax can be applied only once."];
    return ids.map((id) => {
      const s = byId.get(id);
      if (!s) errors[key] = ["Choose a valid sales tax."];
      return s!;
    }).filter(Boolean);
  };

  const lines = input.lines.map((l, i) => {
    const priceMinor = money(l.price);
    if (!Number.isFinite(priceMinor) || Math.abs(priceMinor) > MAX_MONEY) errors[`lines.${i}.price`] = ["Enter a valid price."];
    let discountStored = 0;
    if (modes.discountPerItem) {
      if (l.discountType === "PERCENTAGE") {
        discountStored = Number(l.discount || 0);
        if (!Number.isFinite(discountStored) || discountStored < 0 || discountStored > 100) errors[`lines.${i}.discount`] = ["Use 0–100%."];
      } else {
        discountStored = input.minor ? Number(l.discount || 0) : toMinor(l.discount || 0);
        if (!Number.isFinite(discountStored) || discountStored < 0) errors[`lines.${i}.discount`] = ["Enter a valid discount."];
      }
    }
    const specs = modes.taxPerItem ? specsFor(l.taxes, `lines.${i}.taxes`) : [];
    const cf = normalizeLineAnswers(lineFields, l.customFields, today);
    if (cf.error) errors[`lines.${i}.customFields`] = [cf.error];
    return { ...l, quantity: roundTo(l.quantity, 2), priceMinor, discountStored, specs, cfValues: cf.values };
  });

  let discount = 0;
  if (!modes.discountPerItem) {
    if (input.discountType === "PERCENTAGE") {
      discount = Number(input.discount || 0);
      if (!Number.isFinite(discount) || discount < 0 || discount > 100) errors.discount = ["Use 0–100%."];
    } else {
      discount = input.minor ? Number(input.discount || 0) : toMinor(input.discount || 0);
      if (!Number.isFinite(discount) || discount < 0) errors.discount = ["Enter a valid discount."];
    }
  }
  const docSpecs = modes.taxPerItem ? [] : specsFor(input.taxes, "taxes");
  const taxIncluded = ctx.settings.tax_included === "YES" ? !!input.taxIncluded : false;

  if (Object.keys(errors).length) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: errors };

  const result = computeDocument({
    lines: lines.map((l) => ({ price: l.priceMinor, quantity: l.quantity, discountType: l.discountType, discount: l.discountStored, taxes: l.specs })),
    discountPerItem: modes.discountPerItem,
    taxPerItem: modes.taxPerItem,
    taxIncluded,
    discountType: input.discountType,
    discount,
    taxes: docSpecs,
    exchangeRate,
  });
  if (!modes.discountPerItem && input.discountType === "FIXED" && result.discountVal > result.subTotal) {
    return { ok: false, error: "The discount cannot exceed the subtotal.", fieldErrors: { discount: ["Discount exceeds the subtotal."] } };
  }
  if (Math.abs(result.total) > MAX_MONEY) return { ok: false, error: "The document total is too large." };

  return {
    ok: true,
    doc: { customer, date, time, closingDate, exchangeRate, taxPerItem: modes.taxPerItem, discountPerItem: modes.discountPerItem, taxIncluded, discountType: input.discountType, discount, result, lines, docSpecs },
  };
}

export type Owner = { invoiceId: number } | { estimateId: number } | { recurringInvoiceId: number };

/** Replaces all lines and applied taxes of a document (spec §4.6: wholesale replacement). */
export async function writeLines(tx: Tx, companyId: number, owner: Owner, doc: Built) {
  await tx.lineItem.deleteMany({ where: owner });
  await tx.appliedTax.deleteMany({ where: owner });
  for (const [i, l] of doc.lines.entries()) {
    const r = doc.result.lines[i];
    const line = await tx.lineItem.create({
      data: {
        companyId,
        ...owner,
        position: i,
        itemId: l.itemId ?? null,
        name: l.name,
        description: l.description || null,
        unitName: l.unitName || null,
        quantity: l.quantity,
        price: l.priceMinor,
        discountType: l.discountType,
        discount: l.discountStored,
        discountVal: r.discountVal,
        tax: r.tax,
        total: r.total,
        basePrice: r.basePrice,
        baseDiscountVal: r.baseDiscountVal,
        baseTax: r.baseTax,
        baseTotal: r.baseTotal,
        exchangeRate: doc.exchangeRate,
        customFields: l.cfValues ?? Prisma.DbNull,
      },
    });
    if (r.taxes.length) {
      await tx.appliedTax.createMany({
        data: r.taxes.map((t, j) => ({ companyId, lineItemId: line.id, position: j, taxTypeId: t.taxTypeId, name: t.name, calculationType: t.calculationType, percent: t.percent, fixedAmount: t.fixedAmount, compound: t.compound, amount: t.amount, baseAmount: t.baseAmount })),
      });
    }
  }
  if (doc.result.taxes.length) {
    await tx.appliedTax.createMany({
      data: doc.result.taxes.map((t, j) => ({ companyId, ...owner, position: j, taxTypeId: t.taxTypeId, name: t.name, calculationType: t.calculationType, percent: t.percent, fixedAmount: t.fixedAmount, compound: t.compound, amount: t.amount, baseAmount: t.baseAmount })),
    });
  }
}

/** Copies lines/taxes from one document to another (convert, clone, recurring generation). */
export async function copyLines(tx: Tx, companyId: number, from: Owner, to: Owner) {
  const lines = await tx.lineItem.findMany({ where: from, include: { taxes: true }, orderBy: { position: "asc" } });
  for (const l of lines) {
    const { id: _id, invoiceId: _a, estimateId: _b, recurringInvoiceId: _c, taxes, ...rest } = l;
    void _id; void _a; void _b; void _c;
    const created = await tx.lineItem.create({ data: { ...rest, customFields: rest.customFields ?? Prisma.DbNull, ...to, sourceLineId: null } });
    if (taxes.length) {
      await tx.appliedTax.createMany({
        data: taxes.map(({ id: _t, invoiceId: _i, estimateId: _e, recurringInvoiceId: _r, lineItemId: _l, ...t }) => {
          void _t; void _i; void _e; void _r; void _l;
          return { ...t, lineItemId: created.id };
        }),
      });
    }
  }
  const docTaxes = await tx.appliedTax.findMany({ where: { ...from, lineItemId: null } });
  if (docTaxes.length) {
    await tx.appliedTax.createMany({
      data: docTaxes.map(({ id: _t, invoiceId: _i, estimateId: _e, recurringInvoiceId: _r, lineItemId: _l, ...t }) => {
        void _t; void _i; void _e; void _r; void _l;
        return { ...t, ...to };
      }),
    });
  }
  void companyId;
}

export async function logExchangeRate(tx: Tx, companyId: number, currency: string, baseCurrency: string, rate: number) {
  if (currency === baseCurrency) return;
  await tx.exchangeRateLog.create({ data: { companyId, currency, baseCurrency, rate } });
}

export async function lastExchangeRate(companyId: number, currency: string): Promise<number | null> {
  const row = await db.exchangeRateLog.findFirst({ where: { companyId, currency }, orderBy: { createdAt: "desc" } });
  return row?.rate ?? null;
}

/** Document header columns shared by invoices / estimates / recurring invoices. */
export function totalsData(doc: Built) {
  const r = doc.result;
  return {
    currency: doc.customer.currency,
    exchangeRate: doc.exchangeRate,
    taxPerItem: doc.taxPerItem,
    discountPerItem: doc.discountPerItem,
    taxIncluded: doc.taxIncluded,
    discountType: doc.discountType,
    discount: doc.discount,
    discountVal: r.discountVal,
    subTotal: r.subTotal,
    tax: r.tax,
    total: r.total,
  };
}
