import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDate, parseIsoDate } from "@/lib/dates";
import { countryName } from "@/lib/intl-data";
import { companyValues, customerValues, fillPlaceholders } from "@/lib/placeholders";
import { htmlToBlocks, pdfText } from "@/pdf/html";
import type { PdfSection, SimplePdfData } from "@/pdf/simple-pdf";
import { companyAssets } from "./pdf";
import { activityStatement, outstandingStatement } from "./statement";

export const REPORT_TYPES = ["sales-customers", "sales-items", "expenses", "profit-loss", "taxes"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
const TITLES: Record<ReportType, string> = {
  "sales-customers": "Sales by customer",
  "sales-items": "Sales by item",
  expenses: "Expenses",
  "profit-loss": "Profit & loss",
  taxes: "Tax summary",
};

/** Report data (spec §8). All amounts are base (company-currency) values. */
export async function buildReport(companyId: number, type: ReportType, from: string, to: string, opts: { categoryId?: number } = {}): Promise<SimplePdfData> {
  const { company, settings, logo } = await companyAssets(companyId);
  const money = (v: number) => pdfText(formatMoney(v, settings.currency, settings.locale));
  const df = (d: Date | string) => formatDate(typeof d === "string" ? d : isoDate(d), settings.date_format);
  const range = { gte: parseIsoDate(from)!, lte: parseIsoDate(to)! };
  const sections: PdfSection[] = [];

  if (type === "sales-customers") {
    const invs = await db.invoice.findMany({ where: { companyId, invoiceDate: range }, include: { customer: { select: { name: true } } }, orderBy: [{ invoiceDate: "asc" }] });
    const groups = new Map<string, typeof invs>();
    for (const i of invs) groups.set(i.customer.name, [...(groups.get(i.customer.name) ?? []), i]);
    let total = 0;
    for (const [name, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      const sum = list.reduce((s, i) => s + Number(i.baseTotal), 0);
      total += sum;
      sections.push({ heading: name, table: { columns: [{ label: "Date" }, { label: "Number", flex: 1.5 }, { label: "Amount", align: "right" }], rows: list.map((i) => [df(i.invoiceDate), `${i.invoiceNumber}${i.type === "CREDIT_NOTE" ? " (credit note)" : ""}`, money(Number(i.baseTotal))]), footer: ["", "Total", money(sum)] } });
    }
    sections.push({ summary: [{ label: "Total sales", value: money(total), strong: true, boxed: true }] });
  }

  if (type === "sales-items") {
    const lines = await db.lineItem.findMany({ where: { companyId, invoice: { invoiceDate: range } }, select: { name: true, quantity: true, baseTotal: true } });
    const map = new Map<string, { qty: number; amount: number }>();
    for (const l of lines) {
      const cur = map.get(l.name) ?? { qty: 0, amount: 0 };
      cur.qty += l.quantity;
      cur.amount += Number(l.baseTotal);
      map.set(l.name, cur);
    }
    const rows = [...map].sort((a, b) => b[1].amount - a[1].amount);
    const total = rows.reduce((s, [, v]) => s + v.amount, 0);
    sections.push({ table: { columns: [{ label: "Item", flex: 3 }, { label: "Quantity", align: "right" }, { label: "Amount", align: "right", flex: 1.4 }], rows: rows.map(([n, v]) => [pdfText(n), String(Math.round(v.qty * 100) / 100), money(v.amount)]), footer: ["Total sales", "", money(total)] } });
  }

  if (type === "expenses") {
    const exps = await db.expense.findMany({ where: { companyId, expenseDate: range, ...(opts.categoryId ? { categoryId: opts.categoryId } : {}) }, include: { category: true }, orderBy: { expenseDate: "asc" } });
    const groups = new Map<string, typeof exps>();
    for (const e of exps) groups.set(e.category?.name ?? "Uncategorized", [...(groups.get(e.category?.name ?? "Uncategorized") ?? []), e]);
    let total = 0;
    for (const [name, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      const sum = list.reduce((s, e) => s + Number(e.baseAmount), 0);
      total += sum;
      sections.push({ heading: name, table: { columns: [{ label: "Date" }, { label: "Details", flex: 2.5 }, { label: "Amount", align: "right" }], rows: list.map((e) => [df(e.expenseDate), pdfText([e.expenseNumber, e.notes].filter(Boolean).join(" · ") || "—"), money(Number(e.baseAmount))]), footer: ["", "Category total", money(sum)] } });
    }
    sections.push({ summary: [{ label: "Total expenses", value: money(total), strong: true, boxed: true }] });
  }

  if (type === "profit-loss") {
    const income = Number((await db.payment.aggregate({ where: { companyId, paymentDate: range }, _sum: { baseAmount: true } }))._sum.baseAmount ?? 0);
    const byCat = await db.expense.groupBy({ by: ["categoryId"], where: { companyId, expenseDate: range }, _sum: { baseAmount: true } });
    const cats = new Map((await db.expenseCategory.findMany({ where: { companyId } })).map((c) => [c.id, c.name]));
    const totalExp = byCat.reduce((s, c) => s + Number(c._sum.baseAmount ?? 0), 0);
    sections.push({ heading: "Income", table: { columns: [{ label: "Source", flex: 3 }, { label: "Amount", align: "right" }], rows: [["Payments received", money(income)]] } });
    sections.push({ heading: "Expenses", table: { columns: [{ label: "Category", flex: 3 }, { label: "Amount", align: "right" }], rows: byCat.map((c) => [cats.get(c.categoryId) ?? "Uncategorized", money(Number(c._sum.baseAmount ?? 0))]), footer: ["Total expenses", money(totalExp)] } });
    sections.push({ summary: [{ label: "Income", value: money(income) }, { label: "Total expenses", value: money(totalExp) }, { label: "Net profit", value: money(income - totalExp), strong: true, boxed: true }], note: "Cash basis: income is payments received in the period; unpaid invoices are excluded." });
  }

  if (type === "taxes") {
    const out = await db.appliedTax.findMany({ where: { companyId, OR: [{ invoice: { invoiceDate: range, OR: [{ type: "CREDIT_NOTE" }, { status: { not: "DRAFT" } }] } }, { lineItem: { invoice: { invoiceDate: range, OR: [{ type: "CREDIT_NOTE" }, { status: { not: "DRAFT" } }] } } }] } });
    const outMap = new Map<string, number>();
    for (const t of out) {
      const k = `${t.name}${t.calculationType === "PERCENTAGE" ? ` (${t.percent}%)` : ""}`;
      outMap.set(k, (outMap.get(k) ?? 0) + Number(t.baseAmount));
    }
    const input = await db.expenseTax.findMany({ where: { expense: { companyId, expenseDate: range } }, include: { taxType: true, expense: { select: { exchangeRate: true } } } });
    const inMap = new Map<string, number>();
    for (const t of input) {
      const k = `${t.taxType.name}${t.taxType.calculationType === "PERCENTAGE" ? ` (${t.taxType.percent}%)` : ""}`;
      inMap.set(k, (inMap.get(k) ?? 0) + Math.round(Number(t.amount) * t.expense.exchangeRate));
    }
    const outTotal = [...outMap.values()].reduce((a, b) => a + b, 0);
    const inTotal = [...inMap.values()].reduce((a, b) => a + b, 0);
    const cols = [{ label: "Tax", flex: 3 }, { label: "Amount", align: "right" as const }];
    sections.push({ heading: "Output tax (sales)", table: { columns: cols, rows: [...outMap].map(([k, v]) => [pdfText(k), money(v)]), footer: ["Total output tax", money(outTotal)] } });
    sections.push({ heading: "Input tax (purchases)", table: { columns: cols, rows: [...inMap].map(([k, v]) => [pdfText(k), money(v)]), footer: ["Total input tax", money(inTotal)] } });
    const balance = outTotal - inTotal;
    sections.push({ summary: [{ label: balance >= 0 ? "Tax payable" : "Tax refundable", value: money(Math.abs(balance)), strong: true, boxed: true }] });
  }

  return {
    logo,
    companyName: pdfText(company.name),
    companyBlock: htmlToBlocks(fillPlaceholders(settings.invoice_company_address_format, companyValues(company, countryName))),
    title: TITLES[type],
    subtitle: `${df(from)} – ${df(to)} · amounts in ${settings.currency}`,
    sections,
    footer: `${pdfText(company.name)} · ${TITLES[type]}`,
  };
}

export async function buildStatement(companyId: number, customerId: number, type: "activity" | "outstanding", from: string, to: string): Promise<SimplePdfData | null> {
  const c = await db.customer.findFirst({ where: { id: customerId, companyId } });
  if (!c) return null;
  const { company, settings, logo } = await companyAssets(companyId);
  const money = (v: number) => pdfText(formatMoney(v, c.currency, settings.locale));
  const df = (d: string | null) => (d ? formatDate(d, settings.date_format) : "—");
  const sections: PdfSection[] = [];
  if (type === "activity") {
    const st = await activityStatement(companyId, customerId, from, to);
    sections.push({
      table: {
        columns: [{ label: "Date" }, { label: "Type" }, { label: "Reference", flex: 1.4 }, { label: "Debit", align: "right" }, { label: "Credit", align: "right" }, { label: "Balance", align: "right" }],
        rows: [["", "Opening balance", "", "", "", money(st.opening)], ...st.entries.map((e) => [df(e.date), e.type, e.number, e.debit ? money(e.debit) : "", e.credit ? money(e.credit) : "", money(e.balance)])],
        footer: ["", "Closing balance", "", "", "", money(st.closing)],
      },
    });
  } else {
    const st = await outstandingStatement(companyId, customerId, to);
    sections.push({ heading: "Open invoices", table: { columns: [{ label: "Invoice" }, { label: "Date" }, { label: "Due date" }, { label: "Original", align: "right" }, { label: "Applied", align: "right" }, { label: "Remaining", align: "right" }], rows: st.open.map((i) => [i.number, df(i.date), df(i.dueDate), money(i.original), money(i.applied), money(i.remaining)]) } });
    if (st.credits.length) sections.push({ heading: "Unapplied payments", table: { columns: [{ label: "Payment" }, { label: "Date" }, { label: "Amount", align: "right" }, { label: "Available", align: "right" }], rows: st.credits.map((p) => [p.number, df(p.date), money(p.amount), money(p.available)]) } });
    sections.push({ summary: [{ label: "Total due", value: money(st.totalDue) }, { label: "Unapplied credit", value: `-${money(st.totalCredit)}` }, { label: "Balance", value: money(st.balance), strong: true, boxed: true }] });
  }
  const values = { ...companyValues(company, countryName), ...customerValues(c, countryName) };
  return {
    logo,
    companyName: pdfText(company.name),
    companyBlock: htmlToBlocks(fillPlaceholders(settings.invoice_company_address_format, values)),
    title: "Customer statement",
    subtitle: type === "activity" ? `Activity ${df(from)} – ${df(to)}` : `Outstanding as of ${df(to)}`,
    party: { heading: "CUSTOMER", blocks: htmlToBlocks(fillPlaceholders(settings.invoice_billing_address_format, values)) },
    sections,
    footer: `${pdfText(company.name)} · Statement for ${pdfText(c.name)}`,
  };
}
