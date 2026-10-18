import Link from "next/link";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { PaidBadge, StatusBadge } from "@/components/status-badges";
import { requirePortalCustomer } from "@/lib/auth/portal";
import { db } from "@/lib/db";
import { getCompanySettings } from "@/lib/settings";
import { formatDate, isoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export default async function PortalDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { customer, company } = await requirePortalCustomer(slug);
  const s = await getCompanySettings(company.id);
  const money = (v: number | bigint) => formatMoney(v, customer.currency, s.locale);
  const base = { customerId: customer.id, companyId: company.id };
  const [due, invCount, estCount, payCount, invs, ests] = await Promise.all([
    db.invoice.aggregate({ where: { ...base, type: "INVOICE", status: { not: "DRAFT" } }, _sum: { dueAmount: true } }),
    db.invoice.count({ where: { ...base, type: "INVOICE", status: { not: "DRAFT" } } }),
    db.estimate.count({ where: { ...base, status: { not: "DRAFT" } } }),
    db.payment.count({ where: base }),
    db.invoice.findMany({ where: { ...base, status: { not: "DRAFT" } }, orderBy: { invoiceDate: "desc" }, take: 5 }),
    db.estimate.findMany({ where: { ...base, status: { not: "DRAFT" } }, orderBy: { estimateDate: "desc" }, take: 5 }),
  ]);
  const df = (d: Date | null) => (d ? formatDate(isoDate(d), s.date_format) : "—");
  return (
    <>
      <PageHeader title={`Welcome, ${customer.name}`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-4" data-tour="portal-summary">
        {[["Amount due", money(due._sum.dueAmount ?? 0)], ["Invoices", invCount], ["Estimates", estCount], ["Payments", payCount]].map(([k, v]) => (
          <Card key={k as string} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{k}</p>
            <p className="tabular mt-1 text-xl font-semibold">{v}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-tour="portal-invoices">
          <CardHeader title="Recent invoices" actions={<Link href={`/portal/${slug}/invoices`} className="text-sm text-brand-700 hover:underline">View all</Link>} />
          {invs.length === 0 ? <CardBody className="text-sm text-muted">No invoices yet.</CardBody> : (
            <ul className="divide-y divide-line text-sm">
              {invs.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-5 py-2">
                  <div><Link href={`/portal/${slug}/invoices/${i.id}`} className="font-medium text-brand-700 hover:underline">{i.invoiceNumber}</Link><p className="text-xs text-muted">Due {df(i.dueDate)}</p></div>
                  <div className="text-right"><p className="tabular">{money(i.dueAmount)}</p>{i.type === "INVOICE" ? <PaidBadge paidStatus={i.paidStatus} overdue={i.overdue} /> : null}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card data-tour="portal-estimates">
          <CardHeader title="Recent estimates" actions={<Link href={`/portal/${slug}/estimates`} className="text-sm text-brand-700 hover:underline">View all</Link>} />
          {ests.length === 0 ? <CardBody className="text-sm text-muted">No estimates yet.</CardBody> : (
            <ul className="divide-y divide-line text-sm">
              {ests.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-5 py-2">
                  <div><Link href={`/portal/${slug}/estimates/${e.id}`} className="font-medium text-brand-700 hover:underline">{e.estimateNumber}</Link><p className="text-xs text-muted">{df(e.estimateDate)}</p></div>
                  <div className="text-right"><p className="tabular">{money(e.total)}</p><StatusBadge kind="est" value={e.status} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
