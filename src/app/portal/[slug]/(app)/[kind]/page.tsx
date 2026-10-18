import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { PaidBadge, StatusBadge } from "@/components/status-badges";
import { requirePortalCustomer } from "@/lib/auth/portal";
import { db } from "@/lib/db";
import { getCompanySettings } from "@/lib/settings";
import { formatDate, isoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/** Portal lists: /portal/<slug>/invoices | estimates | payments (non-draft, own records only). */
export default async function PortalList({ params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  if (!["invoices", "estimates", "payments"].includes(kind)) notFound();
  const { customer, company } = await requirePortalCustomer(slug);
  const s = await getCompanySettings(company.id);
  const money = (v: number | bigint) => formatMoney(v, customer.currency, s.locale);
  const df = (d: Date | null) => (d ? formatDate(isoDate(d), s.date_format) : "—");
  const base = { customerId: customer.id, companyId: company.id };
  const href = (id: number) => `/portal/${slug}/${kind}/${id}`;
  let body: React.ReactNode;
  if (kind === "invoices") {
    const rows = await db.invoice.findMany({ where: { ...base, status: { not: "DRAFT" } }, orderBy: { invoiceDate: "desc" } });
    body = rows.length ? (
      <Table>
        <thead><tr><Th>Date</Th><Th>Number</Th><Th>Status</Th><Th className="text-right">Amount due</Th><Th className="text-right">Total</Th></tr></thead>
        <tbody className="divide-y divide-line">{rows.map((i) => (
          <tr key={i.id}><Td>{df(i.invoiceDate)}</Td><Td><Link href={href(i.id)} className="font-medium text-brand-700 hover:underline">{i.invoiceNumber}</Link>{i.type === "CREDIT_NOTE" ? <span className="ml-2 text-xs text-muted">Credit note</span> : null}</Td><Td className="flex gap-1"><StatusBadge kind="inv" value={i.status} />{i.type === "INVOICE" ? <PaidBadge paidStatus={i.paidStatus} overdue={i.overdue} /> : null}</Td><Td className="tabular text-right">{money(i.dueAmount)}</Td><Td className="tabular text-right">{money(i.total)}</Td></tr>
        ))}</tbody>
      </Table>
    ) : null;
  } else if (kind === "estimates") {
    const rows = await db.estimate.findMany({ where: { ...base, status: { not: "DRAFT" } }, orderBy: { estimateDate: "desc" } });
    body = rows.length ? (
      <Table>
        <thead><tr><Th>Date</Th><Th>Number</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></thead>
        <tbody className="divide-y divide-line">{rows.map((e) => (
          <tr key={e.id}><Td>{df(e.estimateDate)}</Td><Td><Link href={href(e.id)} className="font-medium text-brand-700 hover:underline">{e.estimateNumber}</Link></Td><Td><StatusBadge kind="est" value={e.status} /></Td><Td className="tabular text-right">{money(e.total)}</Td></tr>
        ))}</tbody>
      </Table>
    ) : null;
  } else {
    const rows = await db.payment.findMany({ where: base, include: { paymentMethod: true, allocations: { include: { invoice: { select: { invoiceNumber: true } } } } }, orderBy: { paymentDate: "desc" } });
    body = rows.length ? (
      <Table>
        <thead><tr><Th>Date</Th><Th>Number</Th><Th>Mode</Th><Th>Invoices</Th><Th className="text-right">Amount</Th></tr></thead>
        <tbody className="divide-y divide-line">{rows.map((p) => (
          <tr key={p.id}><Td>{df(p.paymentDate)}</Td><Td><Link href={href(p.id)} className="font-medium text-brand-700 hover:underline">{p.paymentNumber}</Link></Td><Td>{p.paymentMethod?.name ?? "—"}</Td><Td className="text-muted">{p.allocations.map((a) => a.invoice.invoiceNumber).join(", ") || "—"}</Td><Td className="tabular text-right">{money(p.amount)}</Td></tr>
        ))}</tbody>
      </Table>
    ) : null;
  }
  const title = kind.charAt(0).toUpperCase() + kind.slice(1);
  return (
    <>
      <PageHeader title={title} />
      <Card data-tour="portal-records">{body ?? <EmptyState title={`No ${kind} yet`} description="Documents appear here once they have been sent to you." />}</Card>
    </>
  );
}
