import { db } from "@/lib/db";
import { isoDate } from "@/lib/dates";
import type { OpenBill, SupplierOpt, TaxOpt } from "@/components/purchasing/forms";

/** Lookup data shared by the purchasing screens. */

export async function supplierOptions(companyId: number): Promise<SupplierOpt[]> {
  const rows = await db.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, enabled: true, paymentTerms: true, expenseCategoryId: true } });
  return rows;
}

export async function purchaseTaxOptions(companyId: number): Promise<TaxOpt[]> {
  const rows = await db.taxType.findMany({ where: { companyId, transactionType: "PURCHASES" }, orderBy: { name: "asc" } });
  return rows.map((t) => ({ id: t.id, name: t.name, calculationType: t.calculationType, percent: t.percent, fixedAmount: t.fixedAmount === null ? null : Number(t.fixedAmount), compound: t.compound }));
}

export async function categoryOptions(companyId: number) {
  return db.expenseCategory.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** Last logged rate per foreign currency (the provider lookup is offered on sales documents). */
export async function lastRates(companyId: number): Promise<Record<string, number>> {
  const rows = await db.exchangeRateLog.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, select: { currency: true, rate: true }, take: 500 });
  const out: Record<string, number> = {};
  for (const r of rows) if (!(r.currency in out)) out[r.currency] = r.rate;
  return out;
}

export async function openBillOptions(companyId: number, supplierId?: number): Promise<OpenBill[]> {
  const rows = await db.bill.findMany({
    where: { companyId, type: "BILL", status: "OPEN", ...(supplierId ? { supplierId } : {}) },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    select: { id: true, supplierId: true, number: true, currency: true, dueAmount: true, dueDate: true, documentDate: true },
  });
  return rows.map((b) => ({ id: b.id, supplierId: b.supplierId, number: b.number, currency: b.currency, due: Number(b.dueAmount), dueDate: b.dueDate ? isoDate(b.dueDate) : null, documentDate: isoDate(b.documentDate) }));
}

export const BILL_STATUS_TONE = { DRAFT: "gray", OPEN: "blue", VOID: "red" } as const;
