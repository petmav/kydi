import { db } from "@/lib/db";
import { isoDate, parseIsoDate } from "@/lib/dates";

/** Customer statement (spec §5.2): activity with running balance, or outstanding as of a date. */

export type ActivityEntry = { date: string; type: "Invoice" | "Credit note" | "Payment"; number: string; debit: number; credit: number; balance: number; href: string };

export async function activityStatement(companyId: number, customerId: number, from: string, to: string) {
  const fromD = parseIsoDate(from)!;
  const toD = parseIsoDate(to)!;
  const invWhere = { companyId, customerId, status: { not: "DRAFT" as const } };
  const [invBefore, cnBefore, payBefore, invs, pays] = await Promise.all([
    db.invoice.aggregate({ where: { ...invWhere, type: "INVOICE", invoiceDate: { lt: fromD } }, _sum: { total: true } }),
    db.invoice.aggregate({ where: { companyId, customerId, type: "CREDIT_NOTE", invoiceDate: { lt: fromD } }, _sum: { total: true } }),
    db.payment.aggregate({ where: { companyId, customerId, paymentDate: { lt: fromD } }, _sum: { amount: true } }),
    db.invoice.findMany({
      where: { companyId, customerId, invoiceDate: { gte: fromD, lte: toD }, OR: [{ type: "CREDIT_NOTE" }, { status: { not: "DRAFT" } }] },
      orderBy: [{ invoiceDate: "asc" }, { id: "asc" }],
      take: 500,
    }),
    db.payment.findMany({ where: { companyId, customerId, paymentDate: { gte: fromD, lte: toD } }, orderBy: [{ paymentDate: "asc" }, { id: "asc" }], take: 500 }),
  ]);
  const opening = Number(invBefore._sum.total ?? 0) - Math.abs(Number(cnBefore._sum.total ?? 0)) - Number(payBefore._sum.amount ?? 0);
  const raw = [
    ...invs.map((i) => ({
      date: isoDate(i.invoiceDate),
      type: (i.type === "CREDIT_NOTE" ? "Credit note" : "Invoice") as ActivityEntry["type"],
      number: i.invoiceNumber,
      debit: i.type === "INVOICE" ? Number(i.total) : 0,
      credit: i.type === "CREDIT_NOTE" ? Math.abs(Number(i.total)) : 0,
      href: `/invoices/${i.id}`,
    })),
    ...pays.map((p) => ({ date: isoDate(p.paymentDate), type: "Payment" as const, number: p.paymentNumber, debit: 0, credit: Number(p.amount), href: `/payments/${p.id}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  let running = opening;
  const entries: ActivityEntry[] = raw.map((e) => {
    running += e.debit - e.credit;
    return { ...e, balance: running };
  });
  return { opening, entries, closing: running };
}

export async function outstandingStatement(companyId: number, customerId: number, asOf: string) {
  const asOfD = parseIsoDate(asOf)!;
  const invoices = await db.invoice.findMany({
    where: { companyId, customerId, type: "INVOICE", status: { not: "DRAFT" }, invoiceDate: { lte: asOfD }, dueAmount: { gt: 0 } },
    orderBy: { invoiceDate: "asc" },
  });
  const payments = await db.payment.findMany({ where: { companyId, customerId, paymentDate: { lte: asOfD } }, include: { allocations: true }, orderBy: { paymentDate: "asc" } });
  const open = invoices.map((i) => ({
    id: i.id,
    number: i.invoiceNumber,
    date: isoDate(i.invoiceDate),
    dueDate: i.dueDate ? isoDate(i.dueDate) : null,
    original: Number(i.total),
    applied: Number(i.total) - Number(i.dueAmount),
    remaining: Number(i.dueAmount),
  }));
  const credits = payments
    .map((p) => {
      const allocated = p.allocations.reduce((s, a) => s + Number(a.amount), 0);
      return { id: p.id, number: p.paymentNumber, date: isoDate(p.paymentDate), amount: Number(p.amount), allocated, available: Number(p.amount) - allocated };
    })
    .filter((p) => p.available > 0);
  const totalDue = open.reduce((s, i) => s + i.remaining, 0);
  const totalCredit = credits.reduce((s, c) => s + c.available, 0);
  return { open, credits, totalDue, totalCredit, balance: totalDue - totalCredit };
}
