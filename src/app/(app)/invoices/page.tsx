import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { Badge, Card, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { FilterBar, NoResults, Pagination, SortHeader, Tabs } from "@/components/list";
import { BulkDelete, BulkProvider, RowCheck, SelectAll } from "@/components/bulk";
import { CreditedBadge, PaidBadge, StatusBadge } from "@/components/status-badges";
import { DocSwitch } from "@/components/documents/doc-switch";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate, parseIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pageMeta, parseList, type SearchParams } from "@/lib/list";
import { deleteInvoicesAction } from "./actions";

export const metadata: Metadata = { title: "Invoices" };
const SORTS = ["sequenceNumber", "invoiceDate", "invoiceNumber", "dueAmount", "total"] as const;
const TABS = [
  { key: "draft", label: "Draft" },
  { key: "due", label: "Due" },
  { key: "sent", label: "Sent" },
  { key: "all", label: "All" },
];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-invoice")) return <Forbidden />;
  const sp = await searchParams;
  const p = parseList(sp, SORTS, "sequenceNumber", "desc");
  const tab = TABS.some((t) => t.key === p.q("tab")) ? p.q("tab") : "all";
  const where: Prisma.InvoiceWhereInput = { companyId: ctx.companyId };
  if (tab === "draft") where.status = "DRAFT";
  if (tab === "sent") where.status = { in: ["SENT", "VIEWED"] };
  if (tab === "due") Object.assign(where, { type: "INVOICE", paidStatus: { in: ["UNPAID", "PARTIALLY_PAID"] }, status: { not: "DRAFT" } });
  if (p.q("customer")) where.customerId = Number(p.q("customer")) || undefined;
  const st = p.q("status");
  if (["DRAFT", "SENT", "VIEWED", "COMPLETED"].includes(st)) where.status = st as Prisma.InvoiceWhereInput["status"];
  if (st === "DUE") where.paidStatus = { in: ["UNPAID", "PARTIALLY_PAID"] };
  if (["UNPAID", "PAID", "PARTIALLY_PAID"].includes(st)) where.paidStatus = st as Prisma.InvoiceWhereInput["paidStatus"];
  if (st === "OVERDUE") where.overdue = true;
  const from = parseIsoDate(p.q("from"));
  const to = parseIsoDate(p.q("to"));
  if (from && to) where.invoiceDate = { gte: from, lte: to };
  if (p.q("number")) where.invoiceNumber = { contains: p.q("number"), mode: "insensitive" };

  const [totalAll, total, customers] = await Promise.all([
    db.invoice.count({ where: { companyId: ctx.companyId } }),
    db.invoice.count({ where }),
    db.customer.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const meta = pageMeta(total, p);
  const rows = await db.invoice.findMany({
    where,
    include: { customer: { select: { name: true } }, creditNotes: { select: { total: true } } },
    orderBy: [{ [p.sort]: p.dir }, { id: "desc" }],
    skip: meta.skip,
    take: meta.take,
  });
  const s = ctx.settings;
  const base = "/invoices";
  const canDelete = ctx.can("delete-invoice");
  return (
    <>
      <PageHeader
        title="Invoices"
        actions={
          <>
            {ctx.can("view-recurring-invoice") ? <DocSwitch current="one-time" /> : null}
            {ctx.can("create-invoice") ? (
              <ButtonLink href="/invoices/new">
                <Plus className="h-4 w-4" aria-hidden="true" /> New invoice
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <Card>
        {totalAll === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" aria-hidden="true" />}
            title="No invoices yet"
            description="Create your first invoice and send it to a customer."
            action={ctx.can("create-invoice") ? <ButtonLink href="/invoices/new">New invoice</ButtonLink> : undefined}
          />
        ) : (
          <BulkProvider>
            <Tabs tabs={TABS} current={tab} basePath={base} sp={sp} />
            <FilterBar
              sp={sp}
              basePath={base}
              filters={[
                { name: "customer", label: "Customer", type: "select", options: customers.map((c) => ({ value: String(c.id), label: c.name })) },
                {
                  name: "status",
                  label: "Status",
                  type: "select",
                  options: [
                    { value: "DRAFT", label: "Draft" },
                    { value: "DUE", label: "Due" },
                    { value: "SENT", label: "Sent" },
                    { value: "VIEWED", label: "Viewed" },
                    { value: "COMPLETED", label: "Completed" },
                    { value: "UNPAID", label: "Unpaid" },
                    { value: "PARTIALLY_PAID", label: "Partially paid" },
                    { value: "PAID", label: "Paid" },
                    { value: "OVERDUE", label: "Overdue" },
                  ],
                },
                { name: "from", label: "From date", type: "date" },
                { name: "to", label: "To date", type: "date" },
                { name: "number", label: "Invoice number" },
              ]}
            />
            {canDelete ? <BulkDelete action={deleteInvoicesAction} noun="invoices" /> : null}
            {rows.length === 0 ? (
              <NoResults />
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full divide-y divide-line text-sm">
                  <thead>
                    <tr>
                      {canDelete ? <Th className="w-10"><SelectAll ids={rows.map((r) => r.id)} /></Th> : null}
                      <SortHeader label="Date" field="invoiceDate" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <SortHeader label="Number" field="invoiceNumber" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <Th>Customer</Th>
                      <Th>Status</Th>
                      <SortHeader label="Amount due" field="dueAmount" sp={sp} sort={p.sort} dir={p.dir} basePath={base} align="right" />
                      <SortHeader label="Total" field="total" sp={sp} sort={p.sort} dir={p.dir} basePath={base} align="right" />
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {rows.map((inv) => {
                      const credited = Math.abs(inv.creditNotes.reduce((a, c) => a + Number(c.total), 0));
                      return (
                        <tr key={inv.id} className="hover:bg-canvas">
                          {canDelete ? <Td><RowCheck id={inv.id} label={inv.invoiceNumber} /></Td> : null}
                          <Td className="text-muted">{formatDate(isoDate(inv.invoiceDate), s.date_format)}</Td>
                          <Td>
                            <Link href={`/invoices/${inv.id}`} className="font-medium text-brand-800 hover:underline focus-ring rounded">{inv.invoiceNumber}</Link>
                            {inv.type === "CREDIT_NOTE" ? <Badge className="ml-2">Credit note</Badge> : null}
                          </Td>
                          <Td>{inv.customer.name}</Td>
                          <Td>
                            <div className="flex gap-1">
                              <StatusBadge kind="inv" value={inv.status} />
                              <CreditedBadge credited={credited} total={Number(inv.total)} />
                            </div>
                          </Td>
                          <Td className="text-right">
                            <span className="tabular">{formatMoney(inv.dueAmount, inv.currency, s.locale)}</span>
                            {inv.type === "INVOICE" ? <div className="mt-0.5"><PaidBadge paidStatus={inv.paidStatus} overdue={inv.overdue} /></div> : null}
                          </Td>
                          <Td className="tabular text-right">{formatMoney(inv.total, inv.currency, s.locale)}</Td>
                          <Td className="text-right">
                            <Link href={`/invoices/${inv.id}`} className="text-sm text-brand-700 hover:underline focus-ring rounded">View</Link>
                          </Td>
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
