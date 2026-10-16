import type { Metadata } from "next";
import { Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { Tabs } from "@/components/list";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { addDaysIso, isoDate, parseIsoDate, todayIn } from "@/lib/dates";
import type { SearchParams } from "@/lib/list";
import { cn } from "@/lib/utils";
import { buildReport, REPORT_TYPES, type ReportType } from "@/server/reports";

export const metadata: Metadata = { title: "Reports" };

function presets(today: string) {
  const d = parseIsoDate(today)!;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const q = Math.floor(m / 3);
  const ymd = (yy: number, mm: number, dd: number) => isoDate(new Date(Date.UTC(yy, mm, dd)));
  const dow = (d.getUTCDay() + 6) % 7;
  const weekStart = addDaysIso(today, -dow);
  return [
    { key: "week", label: "This week", from: weekStart, to: addDaysIso(weekStart, 6) },
    { key: "month", label: "This month", from: ymd(y, m, 1), to: ymd(y, m + 1, 0) },
    { key: "quarter", label: "This quarter", from: ymd(y, q * 3, 1), to: ymd(y, q * 3 + 3, 0) },
    { key: "year", label: "This year", from: ymd(y, 0, 1), to: ymd(y, 11, 31) },
    { key: "prev-week", label: "Previous week", from: addDaysIso(weekStart, -7), to: addDaysIso(weekStart, -1) },
    { key: "prev-month", label: "Previous month", from: ymd(y, m - 1, 1), to: ymd(y, m, 0) },
    { key: "prev-quarter", label: "Previous quarter", from: ymd(y, q * 3 - 3, 1), to: ymd(y, q * 3, 0) },
    { key: "prev-year", label: "Previous year", from: ymd(y - 1, 0, 1), to: ymd(y - 1, 11, 31) },
  ];
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-financial-reports")) return <Forbidden />;
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tabRaw = one("tab") || "sales";
  const tab = ["sales", "profit-loss", "expenses", "taxes"].includes(tabRaw) ? tabRaw : "sales";
  const salesBy = one("by") === "items" ? "items" : "customers";
  const type: ReportType = tab === "sales" ? (salesBy === "items" ? "sales-items" : "sales-customers") : (tab as ReportType);
  const today = todayIn(ctx.settings.time_zone);
  const ps = presets(today);
  const preset = ps.find((p) => p.key === one("preset"));
  const from = preset?.from ?? (parseIsoDate(one("from")) ? one("from") : ps[3].from);
  const to = preset?.to ?? (parseIsoDate(one("to")) ? one("to") : ps[3].to);
  const valid = from <= to && REPORT_TYPES.includes(type);
  const categories = tab === "expenses" ? await db.expenseCategory.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }) : [];
  const category = one("category");
  const data = valid ? await buildReport(ctx.companyId, type, from, to, { categoryId: Number(category) || undefined }) : null;
  const qs = new URLSearchParams({ from, to, ...(category ? { category } : {}) }).toString();
  const pdf = `/api/reports/${type}/pdf?${qs}`;
  return (
    <>
      <PageHeader title="Reports" description="Financial reports in your company currency." />
      <Card>
        <Tabs
          basePath="/reports"
          sp={{ from, to }}
          current={tab}
          tabs={[
            { key: "sales", label: "Sales" },
            { key: "profit-loss", label: "Profit & loss" },
            { key: "expenses", label: "Expenses" },
            { key: "taxes", label: "Taxes" },
          ]}
        />
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
          <input type="hidden" name="tab" value={tab} />
          {tab === "sales" ? (
            <label className="text-xs font-medium text-muted">
              Report type
              <select name="by" defaultValue={salesBy} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm text-ink">
                <option value="customers">By customer</option>
                <option value="items">By item</option>
              </select>
            </label>
          ) : null}
          {tab === "expenses" ? (
            <label className="text-xs font-medium text-muted">
              Category
              <select name="category" defaultValue={category} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm text-ink">
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          ) : null}
          <label className="text-xs font-medium text-muted">
            Date range
            <select name="preset" defaultValue={preset?.key ?? ""} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm text-ink">
              <option value="">Custom</option>
              {ps.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">From<input type="date" name="from" defaultValue={from} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm text-ink" /></label>
          <label className="text-xs font-medium text-muted">To<input type="date" name="to" defaultValue={to} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm text-ink" /></label>
          <button type="submit" className={buttonClass("primary", "sm")}>Update report</button>
          {valid ? (
            <a href={`${pdf}&download=1`} className={cn(buttonClass("secondary", "sm"), "ml-auto")}>Download PDF</a>
          ) : null}
        </form>
        {!valid ? <CardBody className="text-sm text-red-700">The end date must be on or after the start date.</CardBody> : null}
      </Card>
      {data ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title={data.title} description={data.subtitle} />
            <CardBody className="space-y-6">
              {data.sections.map((sec, i) => (
                <div key={i}>
                  {sec.heading ? <h3 className="mb-2 text-sm font-semibold">{sec.heading}</h3> : null}
                  {sec.table ? (
                    sec.table.rows.length === 0 ? (
                      <p className="text-sm text-muted">No data for this period.</p>
                    ) : (
                      <Table>
                        <thead><tr>{sec.table.columns.map((c, j) => <Th key={j} className={c.align === "right" ? "text-right" : ""}>{c.label}</Th>)}</tr></thead>
                        <tbody className="divide-y divide-line">
                          {sec.table.rows.map((r, k) => <tr key={k}>{r.map((v, j) => <Td key={j} className={sec.table!.columns[j]?.align === "right" ? "tabular text-right" : ""}>{v}</Td>)}</tr>)}
                          {sec.table.footer ? <tr className="bg-subtle font-semibold">{sec.table.footer.map((v, j) => <Td key={j} className={sec.table!.columns[j]?.align === "right" ? "tabular text-right" : ""}>{v}</Td>)}</tr> : null}
                        </tbody>
                      </Table>
                    )
                  ) : null}
                  {sec.summary ? (
                    <dl className="ml-auto grid max-w-sm grid-cols-2 gap-1 text-sm">
                      {sec.summary.map((r) => (
                        <div key={r.label} className={cn("col-span-2 flex justify-between", r.boxed && "rounded-md border border-slate-400 px-2 py-1", r.strong && "font-semibold")}>
                          <dt>{r.label}</dt>
                          <dd className="tabular">{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {sec.note ? <p className="mt-2 text-xs text-muted">{sec.note}</p> : null}
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="PDF preview" />
            <iframe src={pdf} title={`${data.title} PDF`} className="h-[75vh] w-full border-0" />
          </Card>
        </div>
      ) : null}
    </>
  );
}
