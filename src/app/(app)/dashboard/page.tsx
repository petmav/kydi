import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badges";
import { CashFlowChart } from "@/components/cash-flow-chart";
import { getCompanyContext } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { SearchParams } from "@/lib/list";
import { cn } from "@/lib/utils";
import { dashboardData, resolvePeriod } from "@/server/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

const FIRST_MENU: [string, Parameters<Awaited<ReturnType<typeof getCompanyContext>>["can"]>[0]][] = [
  ["/items", "view-item"],
  ["/customers", "view-customer"],
  ["/estimates", "view-estimate"],
  ["/invoices", "view-invoice"],
  ["/payments", "view-payment"],
  ["/expenses", "view-expense"],
  ["/reports", "view-financial-reports"],
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("dashboard")) redirect(FIRST_MENU.find(([, a]) => ctx.can(a))?.[0] ?? "/settings");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const s = ctx.settings;
  const period = resolvePeriod(s, one("period"), one("from"), one("to"));
  const d = await dashboardData(ctx.companyId, s, period);
  const money = (v: number) => formatMoney(v, s.currency, s.locale);
  const compact = (v: number) => new Intl.NumberFormat(s.locale, { style: "currency", currency: s.currency, notation: "compact", maximumFractionDigits: 1 }).format(v / 100);
  const label = (k: string) => (d.chart.byDay ? formatDate(k, "MMM d") : formatDate(`${k}-01`, d.chart.rows.length > 12 ? "MMM yy" : "MMM"));
  const df = (v: string | null) => (v ? formatDate(v, s.date_format) : "—");
  const r = d.receivables;
  const pct = (v: number) => (r.total ? `${Math.max(2, (v / r.total) * 100)}%` : "0%");
  const periods = [
    { key: "this", label: "This year" },
    { key: "previous", label: "Previous year" },
    { key: "last12", label: "Last 12 months" },
  ];
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${ctx.company.name} · ${period.label}: ${formatDate(period.from, s.date_format)} – ${formatDate(period.to, s.date_format)}`}
        actions={
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="Period">
              {periods.map((p) => (
                <Link key={p.key} href={`/dashboard?period=${p.key}`} aria-current={period.key === p.key ? "true" : undefined} className={cn("px-3 py-1.5 text-sm focus-ring", period.key === p.key ? "bg-brand-700 text-white" : "bg-white text-ink-2 hover:bg-subtle")}>
                  {p.label}
                </Link>
              ))}
            </div>
            <input type="hidden" name="period" value="custom" />
            <label className="text-xs text-muted">From<input type="date" name="from" defaultValue={period.key === "custom" ? period.from : ""} className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-ink" /></label>
            <label className="text-xs text-muted">To<input type="date" name="to" defaultValue={period.key === "custom" ? period.to : ""} className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-ink" /></label>
            <button type="submit" className={buttonClass("secondary", "sm")}>Apply</button>
          </form>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Receivables" actions={ctx.can("view-invoice") ? <Link href="/invoices?tab=due" className="text-sm text-brand-700 hover:underline">View invoices</Link> : null} />
          <CardBody>
            {r.count === 0 ? (
              <p className="text-sm text-muted">Nothing is owed right now.</p>
            ) : (
              <>
                <p className="tabular text-2xl font-semibold">{money(r.total)}</p>
                <p className="text-sm text-muted">outstanding on {r.count} invoice{r.count === 1 ? "" : "s"}</p>
                <div className="mt-4 flex h-2.5 overflow-hidden rounded-sm bg-subtle" aria-hidden="true">
                  <div style={{ width: pct(r.overdue.amount) }} className="bg-red-600" />
                  <div style={{ width: pct(r.soon.amount) }} className="bg-amber-500" />
                  <div style={{ width: pct(r.later.amount) }} className="bg-slate-400" />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  {[
                    { k: "Overdue", v: r.overdue, c: "bg-red-600" },
                    { k: "Due within 30 days", v: r.soon, c: "bg-amber-500" },
                    { k: "Due later", v: r.later, c: "bg-slate-400" },
                  ].map((x) => (
                    <div key={x.k}>
                      <dt className="flex items-center gap-1.5 text-muted"><span className={cn("h-2 w-2 rounded-sm", x.c)} aria-hidden="true" />{x.k}</dt>
                      <dd className="tabular font-medium">{money(x.v.amount)} <span className="text-xs text-muted">({x.v.count})</span></dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </CardBody>
        </Card>
        <div className="grid gap-4">
          {[
            { label: "Customers", value: d.counts.customers, href: "/customers" },
            { label: "Invoices", value: d.counts.invoices, href: "/invoices" },
            { label: "Estimates", value: d.counts.estimates, href: "/estimates" },
          ].map((c) => (
            <Link key={c.label} href={c.href} className="rounded-md border border-line bg-white px-4 py-3 shadow-[var(--shadow-card)] hover:border-slate-300 focus-ring">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{c.label}</p>
              <p className="tabular text-xl font-semibold">{c.value}</p>
            </Link>
          ))}
        </div>
        <Card className="lg:col-span-3">
          <CardHeader title="Cash flow" description={`Company currency (${s.currency}), grouped by ${d.chart.byDay ? "day" : "month"}.`} />
          <CardBody>
            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                ["Total sales", d.chart.totals.sales],
                ["Total receipts", d.chart.totals.receipts],
                ["Total expenses", d.chart.totals.expenses],
                ["Net income", d.chart.totals.net],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-md border border-line px-3 py-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className={cn("tabular font-semibold", (v as number) < 0 && "text-red-700")}>{money(v as number)}</dd>
                </div>
              ))}
            </dl>
            <CashFlowChart rows={d.chart.rows} labelFor={label} format={money} compact={compact} />
          </CardBody>
        </Card>
        {ctx.can("view-invoice") ? (
          <Card className="lg:col-span-2">
            <CardHeader title="Due invoices" actions={<Link href="/invoices?tab=due" className="text-sm text-brand-700 hover:underline">View all</Link>} />
            {d.recentDue.length === 0 ? (
              <CardBody className="text-sm text-muted">No invoices are due.</CardBody>
            ) : (
              <Table>
                <thead><tr><Th>Due on</Th><Th>Customer</Th><Th>Invoice</Th><Th className="text-right">Amount due</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {d.recentDue.map((i) => (
                    <tr key={i.id}>
                      <Td>{df(i.dueDate)}</Td>
                      <Td>{i.customer}</Td>
                      <Td><Link href={`/invoices/${i.id}`} className="text-brand-700 hover:underline">{i.number}</Link></Td>
                      <Td className="tabular text-right">{money(i.due)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        ) : null}
        {ctx.can("view-estimate") ? (
          <Card>
            <CardHeader title="Recent estimates" actions={<Link href="/estimates" className="text-sm text-brand-700 hover:underline">View all</Link>} />
            {d.recentEstimates.length === 0 ? (
              <CardBody className="text-sm text-muted">No estimates yet.</CardBody>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {d.recentEstimates.map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-5 py-2">
                    <div>
                      <Link href={`/estimates/${e.id}`} className="font-medium text-brand-700 hover:underline">{e.number}</Link>
                      <p className="text-xs text-muted">{e.customer} · {df(e.date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular">{money(e.total)}</p>
                      <StatusBadge kind="est" value={e.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
