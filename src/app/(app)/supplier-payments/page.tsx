import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { Badge, Card, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { FilterBar, NoResults, Pagination, SortHeader, Tabs } from "@/components/list";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate, parseIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pageMeta, parseList, type SearchParams } from "@/lib/list";

export const metadata: Metadata = { title: "Supplier payments" };

const SORTS = ["paymentDate", "number", "amount"] as const;

/** Spec §5.9 / §5.0: supplier payments with tabs Payments / Refunds. */
export default async function SupplierPaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  const sp = await searchParams;
  const tabs = [
    { key: "payments", label: "Payments", show: ctx.can("view-supplier-payment") },
    { key: "refunds", label: "Refunds", show: ctx.can("view-supplier-refund") },
  ].filter((t) => t.show);
  if (!tabs.length) return <Forbidden />;
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? tabs[0].key;
  const type = tab === "refunds" ? "REFUND" : "PAYMENT";
  const p = parseList(sp, SORTS, "paymentDate", "desc");
  const where: Prisma.SupplierPaymentWhereInput = { companyId: ctx.companyId, type };
  if (p.q("supplier")) where.supplierId = Number(p.q("supplier")) || undefined;
  if (p.q("number")) where.number = { contains: p.q("number"), mode: "insensitive" };
  const from = parseIsoDate(p.q("from"));
  const to = parseIsoDate(p.q("to"));
  if (from || to) where.paymentDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const [totalAll, total, suppliers] = await Promise.all([
    db.supplierPayment.count({ where: { companyId: ctx.companyId, type } }),
    db.supplierPayment.count({ where }),
    db.supplier.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const meta = pageMeta(total, p);
  const rows = await db.supplierPayment.findMany({
    where,
    include: { supplier: { select: { name: true } }, paymentMethod: { select: { name: true } }, settlements: { include: { bill: { select: { number: true } } } }, refundOfPayment: { select: { number: true } }, refundOfCredit: { select: { number: true } } },
    orderBy: [{ [p.sort]: p.dir }, { id: "desc" }],
    skip: meta.skip,
    take: meta.take,
  });
  const s = ctx.settings;
  const base = "/supplier-payments";
  const canCreate = ctx.can(type === "PAYMENT" ? "create-supplier-payment" : "create-supplier-refund");
  const newHref = type === "PAYMENT" ? "/supplier-payments/new" : "/supplier-payments/refund/new";
  return (
    <>
      <PageHeader
        title="Supplier payments"
        description="Money paid to suppliers and refunds received from them."
        actions={
          canCreate ? (
            <ButtonLink href={newHref}>
              <Plus className="h-4 w-4" aria-hidden="true" /> {type === "PAYMENT" ? "Record payment" : "Record refund"}
            </ButtonLink>
          ) : null
        }
      />
      <Card>
        <Tabs basePath={base} sp={{}} current={tab} tabs={tabs} />
        {totalAll === 0 ? (
          <EmptyState
            icon={<Banknote className="h-6 w-6" aria-hidden="true" />}
            title={type === "PAYMENT" ? "No supplier payments yet" : "No refunds yet"}
            description={type === "PAYMENT" ? "Record what you pay suppliers and apply it to their bills." : "Record money a supplier returns against a payment or a credit."}
            action={canCreate ? <ButtonLink href={newHref}>{type === "PAYMENT" ? "Record payment" : "Record refund"}</ButtonLink> : undefined}
          />
        ) : (
          <>
            <FilterBar
              sp={sp}
              basePath={base}
              filters={[
                { name: "supplier", label: "Supplier", type: "select", options: suppliers.map((x) => ({ value: String(x.id), label: x.name })) },
                { name: "number", label: "Number" },
                { name: "from", label: "From date", type: "date" },
                { name: "to", label: "To date", type: "date" },
              ]}
            />
            {rows.length === 0 ? (
              <NoResults />
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full divide-y divide-line text-sm">
                  <thead>
                    <tr>
                      <SortHeader label="Date" field="paymentDate" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <SortHeader label="Number" field="number" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <Th>Supplier</Th>
                      <Th>Mode</Th>
                      <Th>{type === "PAYMENT" ? "Applied to" : "Refund of"}</Th>
                      <Th>Status</Th>
                      <SortHeader label="Amount" field="amount" sp={sp} sort={p.sort} dir={p.dir} basePath={base} align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-canvas">
                        <Td className="text-muted">{formatDate(isoDate(r.paymentDate), s.date_format)}</Td>
                        <Td>
                          <Link href={`/supplier-payments/${r.id}`} className="font-medium text-brand-700 hover:underline focus-ring rounded">
                            {r.number}
                          </Link>
                        </Td>
                        <Td>{r.supplier.name}</Td>
                        <Td className="text-muted">{r.paymentMethod?.name ?? "—"}</Td>
                        <Td className="max-w-[16rem] truncate text-muted">
                          {type === "PAYMENT" ? r.settlements.map((x) => x.bill.number).join(", ") || "Unallocated" : (r.refundOfPayment?.number ?? r.refundOfCredit?.number ?? "—")}
                        </Td>
                        <Td>{r.status === "VOID" ? <Badge tone="red">Void</Badge> : <Badge tone="blue">Open</Badge>}</Td>
                        <Td className="tabular text-right">{formatMoney(r.amount, r.currency, s.locale)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination sp={sp} basePath={base} page={meta.page} lastPage={meta.lastPage} total={total} limit={p.limit} />
          </>
        )}
      </Card>
    </>
  );
}
