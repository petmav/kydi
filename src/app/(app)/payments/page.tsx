import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { Card, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { FilterBar, NoResults, Pagination, SortHeader } from "@/components/list";
import { BulkDelete, BulkProvider, RowCheck, SelectAll } from "@/components/bulk";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pageMeta, parseList, type SearchParams } from "@/lib/list";
import { deletePaymentsAction } from "./actions";

export const metadata: Metadata = { title: "Payments" };
const SORTS = ["sequenceNumber", "paymentDate", "paymentNumber", "amount"] as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-payment")) return <Forbidden />;
  const sp = await searchParams;
  const p = parseList(sp, SORTS, "sequenceNumber", "desc");
  const where: Prisma.PaymentWhereInput = { companyId: ctx.companyId };
  if (p.q("customer")) where.customerId = Number(p.q("customer")) || undefined;
  if (p.q("number")) where.paymentNumber = { contains: p.q("number"), mode: "insensitive" };
  if (p.q("mode")) where.paymentMethodId = Number(p.q("mode")) || undefined;
  const [totalAll, total, customers, modes] = await Promise.all([
    db.payment.count({ where: { companyId: ctx.companyId } }),
    db.payment.count({ where }),
    db.customer.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.paymentMethod.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
  ]);
  const meta = pageMeta(total, p);
  const rows = await db.payment.findMany({
    where,
    include: { customer: { select: { name: true } }, paymentMethod: true, allocations: { include: { invoice: { select: { invoiceNumber: true } } } } },
    orderBy: [{ [p.sort]: p.dir }, { id: "desc" }],
    skip: meta.skip,
    take: meta.take,
  });
  const s = ctx.settings;
  const base = "/payments";
  const canDelete = ctx.can("delete-payment");
  return (
    <>
      <PageHeader title="Payments" actions={ctx.can("create-payment") ? <ButtonLink href="/payments/new"><Plus className="h-4 w-4" aria-hidden="true" /> Record payment</ButtonLink> : null} />
      <Card>
        {totalAll === 0 ? (
          <EmptyState icon={<Wallet className="h-6 w-6" aria-hidden="true" />} title="No payments yet" description="Record money received and apply it to invoices." action={ctx.can("create-payment") ? <ButtonLink href="/payments/new">Record payment</ButtonLink> : undefined} />
        ) : (
          <BulkProvider>
            <FilterBar
              sp={sp}
              basePath={base}
              filters={[
                { name: "customer", label: "Customer", type: "select", options: customers.map((c) => ({ value: String(c.id), label: c.name })) },
                { name: "number", label: "Payment number" },
                { name: "mode", label: "Payment mode", type: "select", options: modes.map((m) => ({ value: String(m.id), label: m.name })) },
              ]}
            />
            {canDelete ? <BulkDelete action={deletePaymentsAction} noun="payments" warning="Allocations are removed and the affected invoices become due again." /> : null}
            {rows.length === 0 ? (
              <NoResults />
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full divide-y divide-line text-sm" data-tour="records-table">
                  <thead>
                    <tr>
                      {canDelete ? <Th className="w-10"><SelectAll ids={rows.map((r) => r.id)} /></Th> : null}
                      <SortHeader label="Date" field="paymentDate" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <SortHeader label="Number" field="paymentNumber" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <Th>Customer</Th>
                      <Th>Mode</Th>
                      <Th>Applied to</Th>
                      <SortHeader label="Amount" field="amount" sp={sp} sort={p.sort} dir={p.dir} basePath={base} align="right" />
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {rows.map((pm) => {
                      const allocated = pm.allocations.reduce((a, x) => a + Number(x.amount), 0);
                      return (
                        <tr key={pm.id} className="hover:bg-canvas">
                          {canDelete ? <Td><RowCheck id={pm.id} label={pm.paymentNumber} /></Td> : null}
                          <Td className="text-muted">{formatDate(isoDate(pm.paymentDate), s.date_format)}</Td>
                          <Td><Link href={`/payments/${pm.id}`} className="font-medium text-brand-800 hover:underline focus-ring rounded">{pm.paymentNumber}</Link></Td>
                          <Td>{pm.customer.name}</Td>
                          <Td className="text-muted">{pm.paymentMethod?.name ?? "—"}</Td>
                          <Td className="max-w-[16rem] truncate text-muted">
                            {pm.allocations.map((a) => a.invoice.invoiceNumber).join(", ") || "—"}
                            {Number(pm.amount) > allocated ? <span className="ml-1 text-xs text-amber-700">(unapplied {formatMoney(Number(pm.amount) - allocated, pm.currency, s.locale)})</span> : null}
                          </Td>
                          <Td className="tabular text-right">{formatMoney(pm.amount, pm.currency, s.locale)}</Td>
                          <Td className="text-right"><Link href={`/payments/${pm.id}`} className="text-sm text-brand-700 hover:underline focus-ring rounded">View</Link></Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination sp={sp} basePath={base} page={meta.page} lastPage={meta.lastPage} total={total} limit={p.limit} />
          </BulkProvider>
        )}
      </Card>
    </>
  );
}
