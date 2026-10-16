import { z } from "zod";
import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import type { FieldErrors } from "@/lib/action";
import { MAX_MONEY, roundTo, toBase, toMinor } from "@/lib/money";
import { parseIsoDate, todayIn } from "@/lib/dates";
import { isCurrency } from "@/lib/intl-data";
import { deleteStoredFile, extensionOf, RECEIPT_EXTENSIONS, storeFile } from "@/lib/storage";
import { saveCustomFieldAnswers, validateCustomFieldAnswers } from "@/lib/custom-fields";
import { logExchangeRate } from "./documents";
import type { Result } from "./invoices";

export const expenseSchema = z.object({
  expenseDate: z.string().min(1, "Enter the expense date."),
  expenseNumber: z.string().trim().max(255).optional().nullable(),
  categoryId: z.coerce.number({ invalid_type_error: "Choose a category." }).int().positive("Choose a category."),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().refine(isCurrency, "Choose a currency."),
  exchangeRate: z.union([z.string(), z.number()]).optional(),
  customerId: z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === "" || v == null ? null : Number(v))),
  paymentMethodId: z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === "" || v == null ? null : Number(v))),
  notes: z.string().max(65000).optional().nullable(),
  taxes: z.array(z.object({ taxTypeId: z.coerce.number().int().positive(), amount: z.union([z.string(), z.number()]) })).optional(),
  removeReceipt: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
  minor: z.boolean().optional(),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

const MAX_RECEIPT = 20 * 1024 * 1024;

export async function saveExpense(ctx: CompanyContext, id: number | null, input: ExpenseInput, receipt: File | null, cfSource: FormData | Record<string, unknown>): Promise<Result> {
  const existing = id ? await db.expense.findFirst({ where: { id, companyId: ctx.companyId } }) : null;
  if (id && !existing) return { ok: false, error: "Expense not found.", status: 404 };
  const errors: FieldErrors = {};
  const date = parseIsoDate(input.expenseDate);
  if (!date) errors.expenseDate = ["Enter a valid date."];
  if (!(await db.expenseCategory.findFirst({ where: { id: input.categoryId, companyId: ctx.companyId } }))) errors.categoryId = ["Choose a category."];
  const m = (v: string | number) => (input.minor ? Math.round(Number(v)) : toMinor(v));
  const amount = m(input.amount);
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_MONEY) errors.amount = ["Enter an amount of 0 or more."];
  let rate = 1;
  if (input.currency !== ctx.settings.currency) {
    rate = roundTo(Number(input.exchangeRate), 6);
    if (!Number.isFinite(rate) || rate <= 0) errors.exchangeRate = ["Enter the exchange rate."];
  }
  if (input.customerId && !(await db.customer.findFirst({ where: { id: input.customerId, companyId: ctx.companyId } }))) errors.customerId = ["Choose a valid customer."];
  if (input.paymentMethodId && !(await db.paymentMethod.findFirst({ where: { id: input.paymentMethodId, companyId: ctx.companyId } }))) errors.paymentMethodId = ["Choose a valid payment mode."];
  const taxes = (input.taxes ?? []).map((t) => ({ taxTypeId: t.taxTypeId, amount: m(t.amount) }));
  if (new Set(taxes.map((t) => t.taxTypeId)).size !== taxes.length) errors.taxes = ["Each tax can be listed once."];
  if (taxes.some((t) => !Number.isInteger(t.amount) || t.amount < 0)) errors.taxes = ["Tax amounts must be 0 or more."];
  if (taxes.length && (await db.taxType.count({ where: { id: { in: taxes.map((t) => t.taxTypeId) }, companyId: ctx.companyId, transactionType: "PURCHASES" } })) !== taxes.length) errors.taxes = ["Only purchase tax types can be used on expenses."];
  if (receipt && receipt.size > 0) {
    if (!RECEIPT_EXTENSIONS.includes(extensionOf(receipt.name))) errors.receipt = ["Allowed: jpg, png, pdf, doc, docx, xls, xlsx, ppt, pptx."];
    else if (receipt.size > MAX_RECEIPT) errors.receipt = ["Maximum size is 20 MB."];
  }
  if (Object.keys(errors).length) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: errors };
  const cf = await validateCustomFieldAnswers(ctx.companyId, "Expense", cfSource, todayIn(ctx.settings.time_zone));
  if (!cf.ok) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: cf.errors };

  let receiptData: { receiptPath: string | null; receiptName: string | null; receiptMime: string | null; receiptSize: number | null } | undefined;
  if (receipt && receipt.size > 0) {
    const path = await storeFile(`receipts/${ctx.companyId}`, receipt.name, Buffer.from(await receipt.arrayBuffer()));
    await deleteStoredFile(existing?.receiptPath);
    receiptData = { receiptPath: path, receiptName: receipt.name.slice(0, 255), receiptMime: receipt.type || null, receiptSize: receipt.size };
  } else if (input.removeReceipt && existing?.receiptPath) {
    await deleteStoredFile(existing.receiptPath);
    receiptData = { receiptPath: null, receiptName: null, receiptMime: null, receiptSize: null };
  }
  const data = {
    expenseDate: date!,
    expenseNumber: input.expenseNumber || null,
    categoryId: input.categoryId,
    amount,
    currency: input.currency,
    exchangeRate: rate,
    baseAmount: toBase(amount, rate),
    customerId: input.customerId,
    paymentMethodId: input.paymentMethodId,
    notes: input.notes || null,
    ...(receiptData ?? {}),
  };
  const saved = await db.$transaction(async (tx) => {
    const e = existing ? await tx.expense.update({ where: { id: existing.id }, data }) : await tx.expense.create({ data: { ...data, companyId: ctx.companyId, creatorId: ctx.user.id } });
    await tx.expenseTax.deleteMany({ where: { expenseId: e.id } });
    if (taxes.length) await tx.expenseTax.createMany({ data: taxes.map((t) => ({ expenseId: e.id, taxTypeId: t.taxTypeId, amount: t.amount })) });
    await saveCustomFieldAnswers(tx, ctx.companyId, "Expense", e.id, cf.values);
    await logExchangeRate(tx, ctx.companyId, input.currency, ctx.settings.currency, rate);
    return e;
  });
  return { ok: true, id: saved.id };
}

export async function deleteExpenses(ctx: CompanyContext, ids: number[]): Promise<number> {
  const rows = await db.expense.findMany({ where: { id: { in: ids }, companyId: ctx.companyId } });
  for (const e of rows) await deleteStoredFile(e.receiptPath);
  await db.customFieldValue.deleteMany({ where: { modelType: "Expense", modelId: { in: rows.map((r) => r.id) } } });
  const r = await db.expense.deleteMany({ where: { id: { in: rows.map((x) => x.id) } } });
  return r.count;
}
