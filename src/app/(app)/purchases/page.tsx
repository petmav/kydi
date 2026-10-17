import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { addDaysIso, formatDate, isoDate, todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { payablesSplit } from "@/domain/purchasing";

export const metadata: Metadata = { title: "Purchases" };

/** Purchasing overview: payables split in company currency, counters and bills due soonest (spec §5.1 widget 2, §5.9). */
export default async function PurchasesPage() {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-bill") && !ctx.can("view-supplier")) return <Forbidden />;
  const s = ctx.settings;
  const today = todayIn(s.time_zone);
  const [open, suppliers, bills, payments] = await Promise.all([
    db.bill.findMany({ where: { companyId: ctx.companyId, type: "BILL", status: "OPEN", dueAmount: { gt: 0 } }, include: { supplier: { select: { name: true } } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }] }),
    db.supplier.count({ where: { companyId: ctx.companyId } }),
    db.bill.count({ where: { companyId: ctx.companyId, type: "BILL" } }),
    db.supplierPayment.count({ where: { companyId: ctx.companyId, type: "PAYMENT" } }),
  ]);
  const split = payablesSplit(open.map((b) => ({ dueDate: b.dueDate ? isoDate(b.dueDate) : null, baseDue: Number(b.baseDueAmount) })), today, addDaysIso(today, 30));
  const money = (v: number) => formatMoney(v, s.currency, s.locale);
  return (
    <>
      <PageHeader
        title="Purchases"
        description="Payables across all suppliers, in the company currency."
        actions={
          <>
            {ctx.can("create-bill") ? <ButtonLink href="/bills/new">New bill</ButtonLink> : null}
            {ctx.can("create-supplier-payment") ? <ButtonLink href="/supplier-payments/new" variant="secondary">Record payment</ButtonLink> : null}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {[
          ["Outstanding", split.total, `${split.count} open bill(s)`],
          ["Overdue", split.overdue.amount, `${split.overdue.count} bill(s)`],
          ["Due within 30 days", split.dueSoon.amount, `${split.dueSoon.count} bill(s)`],
          ["Due later", split.later.amount, `${split.later.count} bill(s)`],
        ].map(([k, v, h]) => (
          <Card key={k as string} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{k}</p>
            <p className="tabular mt-1 text-xl font-semibold">{money(v as number)}</p>
            <p className="mt-1 text-xs text-muted">{h}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Purchasing" />
          <CardBody>
            <ul className="divide-y divide-line text-sm">
              {[
                ["/suppliers", "Suppliers", suppliers],
                ["/bills", "Bills", bills],
                ["/supplier-payments", "Supplier payments", payments],
              ].map(([href, label, n]) => (
                <li key={href as string} className="flex justify-between py-2">
                  <Link href={href as string} className="text-brand-700 hover:underline focus-ring rounded">
                    {label}
                  </Link>
                  <span className="tabular text-muted">{n}</span>
                </li>
              ))}
              <li className="flex justify-between py-2">
                <Link href="/reports?tab=purchases" className="text-brand-700 hover:underline focus-ring rounded">
                  Purchases report
                </Link>
              </li>
            </ul>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Bills to pay" actions={<Link href="/bills?status=unpaid" className="text-sm text-brand-700 hover:underline">View all</Link>} />
          {open.length === 0 ? (
            <CardBody className="text-sm text-muted">Nothing to pay.</CardBody>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Due</Th>
                  <Th>Bill</Th>
                  <Th>Supplier</Th>
                  <Th className="text-right">Amount due</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {open.slice(0, 8).map((b) => (
                  <tr key={b.id}>
                    <Td className={b.dueDate && isoDate(b.dueDate) < today ? "font-medium text-red-700" : "text-muted"}>{b.dueDate ? formatDate(isoDate(b.dueDate), s.date_format) : "—"}</Td>
                    <Td>
                      <Link href={`/bills/${b.id}`} className="text-brand-700 hover:underline">{b.number}</Link>
                    </Td>
                    <Td>{b.supplier.name}</Td>
                    <Td className="tabular text-right">{formatMoney(b.dueAmount, b.currency, s.locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
