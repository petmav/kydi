import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Repeat } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { Card, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { FilterBar, NoResults, Pagination, Tabs } from "@/components/list";
import { BulkDelete, BulkProvider, RowCheck, SelectAll } from "@/components/bulk";
import { StatusBadge } from "@/components/status-badges";
import { DocSwitch } from "@/components/documents/doc-switch";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pageMeta, parseList, type SearchParams } from "@/lib/list";
import { frequencyLabel } from "@/domain/cron";
import { deleteRecurringAction } from "./actions";

export const metadata: Metadata = { title: "Recurring invoices" };
const TABS = [
  { key: "active", label: "Active" },
  { key: "on_hold", label: "On hold" },
  { key: "all", label: "All" },
];

export default async function RecurringPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-recurring-invoice")) return <Forbidden />;
  const sp = await searchParams;
  const p = parseList(sp, ["startsAt"] as const, "startsAt", "desc");
  const tab = TABS.some((t) => t.key === p.q("tab")) ? p.q("tab") : "all";
  const where: Prisma.RecurringInvoiceWhereInput = { companyId: ctx.companyId };
  if (tab === "active") where.status = "ACTIVE";
  if (tab === "on_hold") where.status = "ON_HOLD";
  if (p.q("customer")) where.customerId = Number(p.q("customer")) || undefined;
  if (["ACTIVE", "ON_HOLD", "COMPLETED"].includes(p.q("status"))) where.status = p.q("status") as Prisma.RecurringInvoiceWhereInput["status"];
  const [totalAll, total, customers] = await Promise.all([
    db.recurringInvoice.count({ where: { companyId: ctx.companyId } }),
    db.recurringInvoice.count({ where }),
    db.customer.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const meta = pageMeta(total, p);
  const rows = await db.recurringInvoice.findMany({ where, include: { customer: { select: { name: true } } }, orderBy: { startsAt: p.dir }, skip: meta.skip, take: meta.take });
  const s = ctx.settings;
  const base = "/recurring-invoices";
  const canDelete = ctx.can("delete-recurring-invoice");
  return (
    <>
      <PageHeader
        title="Recurring invoices"
        description="Schedules that generate invoices automatically."
        actions={
          <>
            <DocSwitch current="recurring" />
            {ctx.can("create-recurring-invoice") ? <ButtonLink href="/recurring-invoices/new"><Plus className="h-4 w-4" aria-hidden="true" /> New recurring invoice</ButtonLink> : null}
          </>
        }
      />
      <Card>
        {totalAll === 0 ? (
          <EmptyState icon={<Repeat className="h-6 w-6" aria-hidden="true" />} title="No recurring invoices" description="Bill retainers and subscriptions automatically on a schedule." action={ctx.can("create-recurring-invoice") ? <ButtonLink href="/recurring-invoices/new">New recurring invoice</ButtonLink> : undefined} />
        ) : (
          <BulkProvider>
            <Tabs tabs={TABS} current={tab} basePath={base} sp={sp} />
            <FilterBar
              sp={sp}
              basePath={base}
              filters={[
                { name: "customer", label: "Customer", type: "select", options: customers.map((c) => ({ value: String(c.id), label: c.name })) },
                { name: "status", label: "Status", type: "select", options: [{ value: "ACTIVE", label: "Active" }, { value: "ON_HOLD", label: "On hold" }, { value: "COMPLETED", label: "Completed" }] },
              ]}
            />
            {canDelete ? <BulkDelete action={deleteRecurringAction} noun="recurring invoices" warning="Generated invoices are kept." /> : null}
            {rows.length === 0 ? (
              <NoResults />
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full divide-y divide-line text-sm" data-tour="records-table">
                  <thead>
                    <tr>
                      {canDelete ? <Th className="w-10"><SelectAll ids={rows.map((r) => r.id)} /></Th> : null}
                      <Th>Starts at</Th>
                      <Th>Customer</Th>
                      <Th>Frequency</Th>
                      <Th>Next invoice</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Total</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-canvas">
                        {canDelete ? <Td><RowCheck id={r.id} label={`schedule for ${r.customer.name}`} /></Td> : null}
                        <Td className="text-muted">{formatDateTime(r.startsAt, s.time_zone, "MMM d, yyyy")}</Td>
                        <Td><Link href={`${base}/${r.id}`} className="font-medium text-brand-800 hover:underline focus-ring rounded">{r.customer.name}</Link></Td>
                        <Td>{frequencyLabel(r.frequency)}</Td>
                        <Td className="text-muted">{r.status === "ACTIVE" && r.nextInvoiceAt ? formatDateTime(r.nextInvoiceAt, s.time_zone) : "—"}</Td>
                        <Td><StatusBadge kind="rec" value={r.status} /></Td>
                        <Td className="tabular text-right">{formatMoney(r.total, r.currency, s.locale)}</Td>
                        <Td className="text-right"><Link href={`${base}/${r.id}`} className="text-sm text-brand-700 hover:underline focus-ring rounded">View</Link></Td>
                      </tr>
                    ))}
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
