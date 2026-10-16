import { db } from "@/lib/db";
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
  const fromD = parseIsoDate(period.from)!;
  const toD = parseIsoDate(period.to)!;
  const soon = addDaysIso(today, 30);
  const [open, customers, invoiceCount, estimateCount, invs, pays, exps, recentDue, recentEst] = await Promise.all([
    db.invoice.findMany({ where: { companyId, type: "INVOICE", status: { not: "DRAFT" }, baseDueAmount: { gt: 0 } }, select: { baseDueAmount: true, dueDate: true } }),
    db.customer.count({ where: { companyId } }),
    db.invoice.count({ where: { companyId, type: "INVOICE" } }),
    db.estimate.count({ where: { companyId } }),
    db.invoice.findMany({ where: { companyId, invoiceDate: { gte: fromD, lte: toD }, OR: [{ type: "CREDIT_NOTE" }, { status: { not: "DRAFT" } }] }, select: { invoiceDate: true, baseTotal: true } }),
    db.payment.findMany({ where: { companyId, paymentDate: { gte: fromD, lte: toD } }, select: { paymentDate: true, baseAmount: true } }),
    db.expense.findMany({ where: { companyId, expenseDate: { gte: fromD, lte: toD } }, select: { expenseDate: true, baseAmount: true } }),
    db.invoice.findMany({ where: { companyId, type: "INVOICE", status: { not: "DRAFT" }, baseDueAmount: { gt: 0 } }, include: { customer: { select: { name: true } } }, orderBy: [{ dueDate: "asc" }], take: 5 }),
    db.estimate.findMany({ where: { companyId }, include: { customer: { select: { name: true } } }, orderBy: [{ estimateDate: "desc" }, { id: "desc" }], take: 5 }),
  ]);
  const split = { overdue: { amount: 0, count: 0 }, soon: { amount: 0, count: 0 }, later: { amount: 0, count: 0 } };
  for (const i of open) {
    const due = i.dueDate ? isoDate(i.dueDate) : null;
    const bucket = due && due < today ? split.overdue : due && due <= soon ? split.soon : split.later;
    bucket.amount += Number(i.baseDueAmount);
    bucket.count++;
  }
  const days = (toD.getTime() - fromD.getTime()) / 86400000;
  const byDay = days <= 62;
  const keyOf = (d: Date) => (byDay ? isoDate(d) : isoDate(d).slice(0, 7));
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
  for (const i of invs) series.get(keyOf(i.invoiceDate))!.sales += Number(i.baseTotal);
  for (const p of pays) series.get(keyOf(p.paymentDate))!.receipts += Number(p.baseAmount);
  for (const e of exps) series.get(keyOf(e.expenseDate))!.expenses += Number(e.baseAmount);
  const rows = buckets.map((b) => {
    const s = series.get(b)!;
    return { key: b, ...s, net: s.receipts - s.expenses };
  });
  const totals = rows.reduce((a, r) => ({ sales: a.sales + r.sales, receipts: a.receipts + r.receipts, expenses: a.expenses + r.expenses, net: a.net + r.net }), { sales: 0, receipts: 0, expenses: 0, net: 0 });
  return {
    receivables: { total: open.reduce((s, i) => s + Number(i.baseDueAmount), 0), count: open.length, ...split },
    counts: { customers, invoices: invoiceCount, estimates: estimateCount },
    chart: { byDay, rows, totals },
    recentDue: recentDue.map((i) => ({ id: i.id, number: i.invoiceNumber, customer: i.customer.name, dueDate: i.dueDate ? isoDate(i.dueDate) : null, due: Number(i.baseDueAmount) })),
    recentEstimates: recentEst.map((e) => ({ id: e.id, number: e.estimateNumber, customer: e.customer.name, date: isoDate(e.estimateDate), total: Number(e.baseTotal), status: e.status })),
  };
}
