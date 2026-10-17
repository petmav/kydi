import { db } from "@/lib/db";
import { payablesSplit } from "@/domain/purchasing";
import { addDaysIso, fiscalYearRange, isoDate, parseIsoDate, todayIn } from "@/lib/dates";
import type { CompanySettings } from "@/lib/settings";

export type Period = { key: string; from: string; to: string; label: string };

export function resolvePeriod(settings: CompanySettings, key: string | undefined, from?: string, to?: string): Period {
  const today = todayIn(settings.time_zone);
  const fy = fiscalYearRange(settings.fiscal_year, today);
  if (key === "previous") {
    const prev = fiscalYearRange(settings.fiscal_year, addDaysIso(fy.from, -1));
    return { key, ...prev, label: "Previous year" };
  }
  if (key === "last12") return { key, from: addDaysIso(today, -365), to: today, label: "Last 12 months" };
  if (key === "custom" && parseIsoDate(from ?? "") && parseIsoDate(to ?? "") && from! <= to!) {
    const maxFrom = addDaysIso(to!, -365 * 5);
    return { key, from: from! < maxFrom ? maxFrom : from!, to: to!, label: "Custom range" };
  }
  return { key: "this", ...fy, label: "This year" };
}

/** Dashboard payload (spec §5.1); amounts are base (company currency) minor units. */
export async function dashboardData(companyId: number, settings: CompanySettings, period: Period) {
  const today = todayIn(settings.time_zone);
  const soon = addDaysIso(today, 30);
  const [open, customers, invoiceCount, estimateCount, chart, recentDue, recentEst, openBills] = await Promise.all([
    db.invoice.findMany({ where: { companyId, type: "INVOICE", status: { not: "DRAFT" }, baseDueAmount: { gt: 0 } }, select: { baseDueAmount: true, dueDate: true } }),
    db.customer.count({ where: { companyId } }),
    db.invoice.count({ where: { companyId, type: "INVOICE" } }),
    db.estimate.count({ where: { companyId } }),
    cashFlow(companyId, period),
    db.invoice.findMany({ where: { companyId, type: "INVOICE", status: { not: "DRAFT" }, baseDueAmount: { gt: 0 } }, include: { customer: { select: { name: true } } }, orderBy: [{ dueDate: "asc" }], take: 5 }),
    db.estimate.findMany({ where: { companyId }, include: { customer: { select: { name: true } } }, orderBy: [{ estimateDate: "desc" }, { id: "desc" }], take: 5 }),
    db.bill.findMany({ where: { companyId, type: "BILL", status: "OPEN", baseDueAmount: { gt: 0 } }, select: { baseDueAmount: true, dueDate: true } }),
  ]);
  const split = { overdue: { amount: 0, count: 0 }, soon: { amount: 0, count: 0 }, later: { amount: 0, count: 0 } };
  for (const i of open) {
    const due = i.dueDate ? isoDate(i.dueDate) : null;
    const bucket = due && due < today ? split.overdue : due && due <= soon ? split.soon : split.later;
    bucket.amount += Number(i.baseDueAmount);
    bucket.count++;
  }
  return {
    receivables: { total: open.reduce((s, i) => s + Number(i.baseDueAmount), 0), count: open.length, ...split },
    payables: payablesSplit(openBills.map((b) => ({ dueDate: b.dueDate ? isoDate(b.dueDate) : null, baseDue: Number(b.baseDueAmount) })), today, soon),
    counts: { customers, invoices: invoiceCount, estimates: estimateCount },
    chart,
    recentDue: recentDue.map((i) => ({ id: i.id, number: i.invoiceNumber, customer: i.customer.name, dueDate: i.dueDate ? isoDate(i.dueDate) : null, due: Number(i.baseDueAmount) })),
    recentEstimates: recentEst.map((e) => ({ id: e.id, number: e.estimateNumber, customer: e.customer.name, date: isoDate(e.estimateDate), total: Number(e.baseTotal), status: e.status })),
  };
}

/**
 * Cash-flow series (spec §5.1 widget 4): sales, receipts, expenses and net income per day (range ≤ 62 days)
 * or per calendar month. With a customer id the series is scoped to that customer (spec §5.2 detail chart).
 */
export async function cashFlow(companyId: number, period: Period, customerId?: number) {
  const fromD = parseIsoDate(period.from)!;
  const toD = parseIsoDate(period.to)!;
  const scope = customerId ? { customerId } : {};
  const [invs, pays, exps, supplierPays] = await Promise.all([
    db.invoice.findMany({ where: { companyId, ...scope, invoiceDate: { gte: fromD, lte: toD }, OR: [{ type: "CREDIT_NOTE" }, { status: { not: "DRAFT" } }] }, select: { invoiceDate: true, baseTotal: true } }),
    db.payment.findMany({ where: { companyId, ...scope, paymentDate: { gte: fromD, lte: toD } }, select: { paymentDate: true, baseAmount: true } }),
    db.expense.findMany({ where: { companyId, ...scope, expenseDate: { gte: fromD, lte: toD } }, select: { expenseDate: true, baseAmount: true } }),
    // Spec §5.1: expenses + supplier payments − supplier refunds (company-wide series only).
    customerId ? Promise.resolve([]) : db.supplierPayment.findMany({ where: { companyId, status: "OPEN", paymentDate: { gte: fromD, lte: toD } }, select: { paymentDate: true, baseAmount: true, type: true } }),
  ]);
  return bucketCashFlow(period, [
    ...invs.map((i) => ({ date: isoDate(i.invoiceDate), kind: "sales" as const, amount: Number(i.baseTotal) })),
    ...pays.map((p) => ({ date: isoDate(p.paymentDate), kind: "receipts" as const, amount: Number(p.baseAmount) })),
    ...exps.map((e) => ({ date: isoDate(e.expenseDate), kind: "expenses" as const, amount: Number(e.baseAmount) })),
    ...supplierPays.map((p) => ({ date: isoDate(p.paymentDate), kind: "expenses" as const, amount: (p.type === "REFUND" ? -1 : 1) * Number(p.baseAmount) })),
  ]);
}

export type CashFlowEntry = { date: string; kind: "sales" | "receipts" | "expenses"; amount: number };

/** Pure bucketing used by cashFlow (unit-tested). Entries outside the period are ignored. */
export function bucketCashFlow(period: { from: string; to: string }, entries: CashFlowEntry[]) {
  const days = (parseIsoDate(period.to)!.getTime() - parseIsoDate(period.from)!.getTime()) / 86400000;
  const byDay = days <= 62;
  const keyOf = (d: string) => (byDay ? d : d.slice(0, 7));
  const buckets: string[] = [];
  if (byDay) for (let d = period.from; d <= period.to; d = addDaysIso(d, 1)) buckets.push(d);
  else {
    const [y, m] = period.from.split("-").map(Number);
    for (let i = 0; ; i++) {
      const k = `${y + Math.floor((m - 1 + i) / 12)}-${String(((m - 1 + i) % 12) + 1).padStart(2, "0")}`;
      if (k > period.to.slice(0, 7)) break;
      buckets.push(k);
    }
  }
  const series = new Map(buckets.map((b) => [b, { sales: 0, receipts: 0, expenses: 0 }]));
  for (const e of entries) {
    const row = series.get(keyOf(e.date));
    if (row) row[e.kind] += e.amount;
  }
  const rows = buckets.map((b) => {
    const s = series.get(b)!;
    return { key: b, ...s, net: s.receipts - s.expenses };
  });
  const totals = rows.reduce((a, r) => ({ sales: a.sales + r.sales, receipts: a.receipts + r.receipts, expenses: a.expenses + r.expenses, net: a.net + r.net }), { sales: 0, receipts: 0, expenses: 0, net: 0 });
  return { byDay, rows, totals };
}
