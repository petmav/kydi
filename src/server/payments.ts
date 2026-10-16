import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import type { FieldErrors } from "@/lib/action";
import { randomToken } from "@/lib/auth/tokens";
import { MAX_MONEY, roundTo, toBase, toMinor } from "@/lib/money";
import { isoDate, parseIsoDate, todayIn } from "@/lib/dates";
import { saveCustomFieldAnswers, validateCustomFieldAnswers } from "@/lib/custom-fields";
import { allocationBaseAmounts } from "@/domain/allocation";
import { DomainError, recalcInvoice, type Result } from "./invoices";
import { nextNumber } from "./numbers";
import { logExchangeRate } from "./documents";

type Tx = Prisma.TransactionClient;

export const paymentSchema = z.object({
  customerId: z.coerce.number({ invalid_type_error: "Choose a customer." }).int().positive("Choose a customer."),
  paymentDate: z.string().min(1, "Enter the payment date."),
  paymentNumber: z.string().trim().max(255).optional().default(""),
  amount: z.union([z.string(), z.number()]),
  exchangeRate: z.union([z.string(), z.number()]).optional(),
  paymentMethodId: z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === "" || v == null ? null : Number(v))),
  notes: z.string().max(65000).optional().nullable(),
  allocations: z.array(z.object({ invoiceId: z.coerce.number().int().positive(), amount: z.union([z.string(), z.number()]) })).optional(),
  minor: z.boolean().optional(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

/** Open (payable) invoices of a customer with the amount still available for allocation. */
export async function openInvoices(companyId: number, customerId: number, excludePaymentId?: number, tx: Tx = db) {
  const invs = await tx.invoice.findMany({
    where: { companyId, customerId, type: "INVOICE", status: { not: "DRAFT" } },
    include: { allocations: true, creditNotes: { select: { total: true } } },
    orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }, { id: "asc" }],
  });
  return invs
    .map((i) => {
      const credited = Math.abs(i.creditNotes.reduce((s, c) => s + Number(c.total), 0));
      const others = i.allocations.filter((a) => a.paymentId !== excludePaymentId).reduce((s, a) => s + Number(a.amount), 0);
      const own = i.allocations.find((a) => a.paymentId === excludePaymentId);
      return { id: i.id, number: i.invoiceNumber, currency: i.currency, date: isoDate(i.invoiceDate), dueDate: i.dueDate ? isoDate(i.dueDate) : null, total: Number(i.total), available: Number(i.total) - credited - others, allocated: own ? Number(own.amount) : 0 };
    })
    .filter((i) => i.available > 0 || i.allocated > 0);
}

async function lockInvoices(tx: Tx, ids: number[]) {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
}

/** Validates and writes the full allocation set of a payment, then recalculates every affected invoice. */
async function replaceAllocations(tx: Tx, ctx: CompanyContext, payment: { id: number; customerId: number; currency: string; amount: number; baseAmount: number }, rows: { invoiceId: number; amount: number }[]) {
  const previous = await tx.paymentAllocation.findMany({ where: { paymentId: payment.id } });
  await lockInvoices(tx, [...previous.map((p) => p.invoiceId), ...rows.map((r) => r.invoiceId)]);
  const errors: FieldErrors = {};
  const seen = new Set<number>();
  let sum = 0;
  const avail = new Map((await openInvoices(ctx.companyId, payment.customerId, payment.id, tx)).map((i) => [i.id, i]));
  for (const [i, r] of rows.entries()) {
    const key = `allocations.${i}.amount`;
    if (seen.has(r.invoiceId)) errors[key] = ["payment_allocation_duplicate_invoice: each invoice once per payment."];
    seen.add(r.invoiceId);
    const inv = await tx.invoice.findFirst({ where: { id: r.invoiceId, companyId: ctx.companyId } });
    if (!inv) errors[key] = ["Invoice not found."];
    else if (inv.customerId !== payment.customerId || inv.currency !== payment.currency) errors[key] = ["Invoice belongs to another customer or currency."];
    else if (inv.type !== "INVOICE" || inv.status === "DRAFT") errors[key] = ["Drafts and credit notes cannot receive payments."];
    else if (!Number.isInteger(r.amount) || r.amount < 1) errors[key] = ["Enter an amount greater than 0."];
    else if (r.amount > (avail.get(r.invoiceId)?.available ?? 0)) errors[key] = ["Exceeds the invoice's outstanding balance."];
    sum += r.amount;
  }
  if (sum > payment.amount) errors.allocations = ["Allocations exceed the payment amount."];
  if (Object.keys(errors).length) throw new DomainError("Please correct the allocations.", errors);
  await tx.paymentAllocation.deleteMany({ where: { paymentId: payment.id } });
  const bases = allocationBaseAmounts(payment.amount, payment.baseAmount, rows.map((r) => r.amount));
  if (rows.length) await tx.paymentAllocation.createMany({ data: rows.map((r, i) => ({ paymentId: payment.id, invoiceId: r.invoiceId, amount: r.amount, baseAmount: bases[i] })) });
  for (const id of new Set([...previous.map((p) => p.invoiceId), ...rows.map((r) => r.invoiceId)])) await recalcInvoice(tx, id);
}

export async function savePayment(ctx: CompanyContext, id: number | null, input: PaymentInput, cfSource: FormData | Record<string, unknown>): Promise<Result> {
  const existing = id ? await db.payment.findFirst({ where: { id, companyId: ctx.companyId }, include: { allocations: true } }) : null;
  if (id && !existing) return { ok: false, error: "Payment not found.", status: 404 };
  const errors: FieldErrors = {};
  const customer = await db.customer.findFirst({ where: { id: input.customerId, companyId: ctx.companyId } });
  if (!customer) return { ok: false, error: "Choose a customer.", fieldErrors: { customerId: ["Choose a customer."] } };
  const date = parseIsoDate(input.paymentDate);
  if (!date) errors.paymentDate = ["Enter a valid date."];
  const amount = input.minor ? Math.round(Number(input.amount)) : toMinor(input.amount);
  if (!Number.isInteger(amount) || amount < 1) errors.amount = ["payment_amount_must_be_positive: enter an amount greater than 0."];
  else if (amount > MAX_MONEY) errors.amount = ["Amount is too large."];
  let rate = 1;
  if (customer.currency !== ctx.settings.currency) {
    rate = roundTo(Number(input.exchangeRate), 6);
    if (!Number.isFinite(rate) || rate <= 0) errors.exchangeRate = ["Enter the exchange rate."];
  }
  if (input.paymentMethodId && !(await db.paymentMethod.findFirst({ where: { id: input.paymentMethodId, companyId: ctx.companyId } }))) errors.paymentMethodId = ["Choose a valid payment mode."];
  if (existing && existing.customerId !== customer.id && existing.allocations.length && (input.allocations === undefined || input.allocations.length > 0)) {
    errors.customerId = ["payment_customer_change_requires_unallocated_credit: remove allocations before changing the customer."];
  }
  if (Object.keys(errors).length) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: errors };
  const cf = await validateCustomFieldAnswers(ctx.companyId, "Payment", cfSource, todayIn(ctx.settings.time_zone));
  if (!cf.ok) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: cf.errors };
  const allocations = input.allocations?.map((a) => ({ invoiceId: a.invoiceId, amount: input.minor ? Math.round(Number(a.amount)) : toMinor(a.amount) })).filter((a) => a.amount !== 0 || true);
  const baseAmount = toBase(amount, rate);
  try {
    const saved = await db.$transaction(async (tx) => {
      const suggestion = !existing ? await nextNumber(ctx.companyId, "payment", customer.id, tx) : existing.customerId !== customer.id ? await nextNumber(ctx.companyId, "payment", customer.id, tx) : null;
      const number = input.paymentNumber || existing?.paymentNumber || suggestion!.number;
      if (await tx.payment.findFirst({ where: { companyId: ctx.companyId, paymentNumber: number, NOT: existing ? { id: existing.id } : undefined } })) {
        throw new DomainError("Payment number already in use.", { paymentNumber: ["This number is already used by another payment."] });
      }
      const data = { customerId: customer.id, paymentNumber: number, paymentDate: date!, amount, currency: customer.currency, exchangeRate: rate, baseAmount, paymentMethodId: input.paymentMethodId, notes: input.notes || null };
      const p = existing
        ? await tx.payment.update({ where: { id: existing.id }, data: { ...data, ...(suggestion ? { customerSequenceNumber: suggestion.customerSequence } : {}) } })
        : await tx.payment.create({ data: { ...data, companyId: ctx.companyId, creatorId: ctx.user.id, sequenceNumber: suggestion!.sequence, customerSequenceNumber: suggestion!.customerSequence, uniqueHash: randomToken(24) } });
      const rows = allocations ?? existing?.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: Number(a.amount) })) ?? [];
      await replaceAllocations(tx, ctx, { id: p.id, customerId: customer.id, currency: customer.currency, amount, baseAmount }, rows.filter((r) => r.amount > 0));
      await saveCustomFieldAnswers(tx, ctx.companyId, "Payment", p.id, cf.values);
      await logExchangeRate(tx, ctx.companyId, customer.currency, ctx.settings.currency, rate);
      return p;
    }, { timeout: 20000 });
    return { ok: true, id: saved.id };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
}

export async function deletePayments(ctx: CompanyContext, ids: number[]): Promise<number> {
  const payments = await db.payment.findMany({ where: { id: { in: ids }, companyId: ctx.companyId }, include: { allocations: true } });
  for (const p of payments) {
    await db.$transaction(async (tx) => {
      const invoiceIds = p.allocations.map((a) => a.invoiceId);
      await lockInvoices(tx, invoiceIds);
      await tx.paymentAllocation.deleteMany({ where: { paymentId: p.id } });
      await tx.customFieldValue.deleteMany({ where: { modelType: "Payment", modelId: p.id } });
      await tx.payment.delete({ where: { id: p.id } });
      for (const id of invoiceIds) await recalcInvoice(tx, id);
    });
  }
  return payments.length;
}

/** Apply customer credit (spec §5.2): adds allocations to existing payments. */
export async function applyCredit(ctx: CompanyContext, customerId: number, rows: { paymentId: number; invoiceId: number; amount: number }[]): Promise<Result> {
  if (!rows.length) return { ok: false, error: "Add at least one allocation." };
  try {
    await db.$transaction(async (tx) => {
      for (const paymentId of [...new Set(rows.map((r) => r.paymentId))]) {
        const p = await tx.payment.findFirst({ where: { id: paymentId, companyId: ctx.companyId, customerId }, include: { allocations: true } });
        if (!p) throw new DomainError("Payment not found.");
        const merged = new Map(p.allocations.map((a) => [a.invoiceId, Number(a.amount)]));
        for (const r of rows.filter((x) => x.paymentId === paymentId)) merged.set(r.invoiceId, (merged.get(r.invoiceId) ?? 0) + r.amount);
        await replaceAllocations(tx, ctx, { id: p.id, customerId, currency: p.currency, amount: Number(p.amount), baseAmount: Number(p.baseAmount) }, [...merged].map(([invoiceId, amount]) => ({ invoiceId, amount })));
      }
    }, { timeout: 20000 });
    return { ok: true, id: customerId };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: Object.values(e.fieldErrors ?? {}).flat()[0] ?? e.message };
    throw e;
  }
}

/** Payments of a customer that still have unapplied credit. */
export async function creditPayments(companyId: number, customerId: number) {
  const ps = await db.payment.findMany({ where: { companyId, customerId }, include: { allocations: true }, orderBy: { paymentDate: "asc" } });
  return ps
    .map((p) => ({ id: p.id, number: p.paymentNumber, date: isoDate(p.paymentDate), available: Number(p.amount) - p.allocations.reduce((s, a) => s + Number(a.amount), 0) }))
    .filter((p) => p.available > 0);
}

/** Replaces the full allocation set of a payment (spec §9.2: PUT payments/{id}/allocations). */
export async function replacePaymentAllocations(ctx: CompanyContext, paymentId: number, rows: { invoiceId: number; amount: number }[]): Promise<Result> {
  const p = await db.payment.findFirst({ where: { id: paymentId, companyId: ctx.companyId } });
  if (!p) return { ok: false, error: "Payment not found.", status: 404 };
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${p.id} FOR UPDATE`;
        await replaceAllocations(tx, ctx, { id: p.id, customerId: p.customerId, currency: p.currency, amount: Number(p.amount), baseAmount: Number(p.baseAmount) }, rows);
      },
      { timeout: 20000 },
    );
    return { ok: true, id: p.id };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
}
