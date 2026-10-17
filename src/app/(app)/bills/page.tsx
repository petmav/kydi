import type { Metadata } from "next";
import Link from "next/link";
import { FileInput, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { Badge, Card, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { ActionButton } from "@/components/confirm";
import { RowActions } from "@/components/settings/forms";
import { FilterBar, NoResults, Pagination, SortHeader, Tabs } from "@/components/list";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, isoDate, parseIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pageMeta, parseList, type SearchParams } from "@/lib/list";
import { frequencyLabel } from "@/domain/cron";
import { BILL_STATUS_TONE } from "../purchases/data";
import { deleteRecurringCostAction, recurringCostStatusAction } from "../purchases/actions";

export const metadata: Metadata = { title: "Bills" };

const SORTS = ["documentDate", "number", "total", "dueDate"] as const;

/** Spec §5.9 bills workspace: tabs Bills / Supplier credits / Recurring bills. */
export default async function BillsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  const sp = await searchParams;
  const tabs = [
    { key: "bills", label: "Bills", show: ctx.can("view-bill") },
    { key: "credits", label: "Supplier credits", show: ctx.can("view-supplier-credit") },
    { key: "recurring", label: "Recurring bills", show: ctx.can("view-recurring-cost") },
  ].filter((t) => t.show);
  if (!tabs.length) return <Forbidden />;
  const rawTab = typeof sp.tab === "string" ? sp.tab : "";
  const tab = tabs.find((t) => t.key === rawTab)?.key ?? tabs[0].key;
  const s = ctx.settings;
  const df = (d: Date | null) => (d ? formatDate(isoDate(d), s.date_format) : "—");
  const newHref = tab === "credits" ? "/bills/new?type=credit" : tab === "recurring" ? "/recurring-costs/new" : "/bills/new";
  const canCreate = ctx.can(tab === "credits" ? "create-supplier-credit" : tab === "recurring" ? "create-recurring-cost" : "create-bill");
  const header = (
    <PageHeader
      title="Bills"
      description="What you owe suppliers."
      actions={
        canCreate ? (
          <ButtonLink href={newHref}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {tab === "credits" ? "New supplier credit" : tab === "recurring" ? "New recurring cost" : "New bill"}
          </ButtonLink>
        ) : null
      }
    />
  );

  if (tab === "recurring") {
    const rows = await db.recurringCost.findMany({ where: { companyId: ctx.companyId }, include: { supplier: { select: { name: true, currency: true } } }, orderBy: { createdAt: "desc" } });
    return (
      <>
        {header}
        <Card>
          <Tabs basePath="/bills" sp={{}} current={tab} tabs={tabs} />
          {rows.length === 0 ? (
            <EmptyState title="No recurring costs" description="Generate a bill or an expense on a schedule, for rent or subscriptions." action={canCreate ? <ButtonLink href="/recurring-costs/new">New recurring cost</ButtonLink> : undefined} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full divide-y divide-line text-sm">
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Supplier</Th>
                    <Th>Creates</Th>
                    <Th>Frequency</Th>
                    <Th>Next run</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white">
                  {rows.map((r) => {
                    const t = r.template as { amount?: number };
                    return (
                      <tr key={r.id}>
                        <Td className="font-medium">
                          {r.name}
                          {r.lastError ? <p className="text-xs text-red-700">Last run failed: {r.lastError === "exchange_rate_missing" ? "no exchange rate logged for the supplier currency" : r.lastError}</p> : null}
                        </Td>
                        <Td>{r.supplier.name}</Td>
                        <Td>{r.mode === "BILL" ? (r.createAsDraft ? "Draft bill" : "Bill") : "Expense"}</Td>
                        <Td className="text-muted">{frequencyLabel(r.frequency)}</Td>
                        <Td className="text-muted">{r.nextRunAt ? formatDateTime(r.nextRunAt, s.time_zone) : "—"}</Td>
                        <Td>
                          <Badge tone={r.status === "ACTIVE" ? "green" : r.status === "ON_HOLD" ? "amber" : "gray"}>{r.status === "ACTIVE" ? "Active" : r.status === "ON_HOLD" ? "On hold" : "Completed"}</Badge>
                        </Td>
                        <Td className="tabular text-right">{formatMoney(t.amount ?? 0, r.supplier.currency, s.locale)}</Td>
                        <Td>
                          <div className="flex items-center justify-end gap-1">
                            {ctx.can("edit-recurring-cost") && r.status !== "COMPLETED" ? (
                              <>
                                <ActionButton action={recurringCostStatusAction.bind(null, r.id, r.status === "ACTIVE" ? "pause" : "resume")} size="sm" variant="ghost">
                                  {r.status === "ACTIVE" ? "Pause" : "Resume"}
                                </ActionButton>
                                <Link href={`/recurring-costs/${r.id}/edit`} className="px-2 text-sm text-brand-700 hover:underline focus-ring rounded">
                                  Edit
                                </Link>
                              </>
                            ) : null}
                            {ctx.can("delete-recurring-cost") ? <RowActions deleteAction={deleteRecurringCostAction.bind(null, r.id)} deleteTitle={`Delete ${r.name}?`} deleteDescription="Documents it already generated are kept." /> : null}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>
    );
  }

  const type = tab === "credits" ? "SUPPLIER_CREDIT" : "BILL";
  const p = parseList(sp, SORTS, "documentDate", "desc");
  const where: Prisma.BillWhereInput = { companyId: ctx.companyId, type };
  if (p.q("supplier")) where.supplierId = Number(p.q("supplier")) || undefined;
  if (["DRAFT", "OPEN", "VOID"].includes(p.q("status"))) where.status = p.q("status") as "DRAFT" | "OPEN" | "VOID";
  if (p.q("status") === "unpaid") Object.assign(where, { status: "OPEN", dueAmount: { gt: 0 } });
  const from = parseIsoDate(p.q("from"));
  const to = parseIsoDate(p.q("to"));
  if (from || to) where.documentDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const [totalAll, total, suppliers] = await Promise.all([
    db.bill.count({ where: { companyId: ctx.companyId, type } }),
    db.bill.count({ where }),
    db.supplier.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const meta = pageMeta(total, p);
  const rows = await db.bill.findMany({ where, include: { supplier: { select: { name: true } } }, orderBy: [{ [p.sort]: p.dir }, { id: "desc" }], skip: meta.skip, take: meta.take });
  const base = "/bills";
  return (
    <>
      {header}
      <Card>
        <Tabs basePath={base} sp={{}} current={tab} tabs={tabs} />
        {totalAll === 0 ? (
          <EmptyState
            icon={<FileInput className="h-6 w-6" aria-hidden="true" />}
            title={type === "BILL" ? "No bills yet" : "No supplier credits yet"}
            description={type === "BILL" ? "Record supplier invoices to track what you owe and pay it on time." : "Record credits your suppliers give you and apply them to bills."}
            action={canCreate ? <ButtonLink href={newHref}>{type === "BILL" ? "New bill" : "New supplier credit"}</ButtonLink> : undefined}
          />
        ) : (
          <>
            <FilterBar
              sp={sp}
              basePath={base}
              filters={[
                { name: "supplier", label: "Supplier", type: "select", options: suppliers.map((x) => ({ value: String(x.id), label: x.name })) },
                {
                  name: "status",
                  label: "Status",
                  type: "select",
                  options: [
                    ...(type === "BILL" ? [{ value: "DRAFT", label: "Draft" }] : []),
                    { value: "OPEN", label: "Open" },
                    ...(type === "BILL" ? [{ value: "unpaid", label: "Unpaid" }] : []),
                    { value: "VOID", label: "Void" },
                  ],
                },
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
                      <SortHeader label="Date" field="documentDate" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <SortHeader label="Number" field="number" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <Th>Supplier</Th>
                      <Th>Reference</Th>
                      {type === "BILL" ? <SortHeader label="Due date" field="dueDate" sp={sp} sort={p.sort} dir={p.dir} basePath={base} /> : null}
                      <Th>Status</Th>
                      <SortHeader label="Total" field="total" sp={sp} sort={p.sort} dir={p.dir} basePath={base} align="right" />
                      {type === "BILL" ? <Th className="text-right">Due</Th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {rows.map((b) => (
                      <tr key={b.id} className="hover:bg-canvas">
                        <Td className="text-muted">{df(b.documentDate)}</Td>
                        <Td>
                          <Link href={`/bills/${b.id}`} className="font-medium text-brand-700 hover:underline focus-ring rounded">
                            {b.number}
                          </Link>
                        </Td>
                        <Td>{b.supplier.name}</Td>
                        <Td className="text-muted">{b.reference ?? "—"}</Td>
                        {type === "BILL" ? <Td className="text-muted">{df(b.dueDate)}</Td> : null}
                        <Td>
                          <Badge tone={BILL_STATUS_TONE[b.status]}>{b.status === "OPEN" ? (type === "BILL" && Number(b.dueAmount) === 0 ? "Paid" : "Open") : b.status === "DRAFT" ? "Draft" : "Void"}</Badge>
                        </Td>
                        <Td className="tabular text-right">{formatMoney(b.total, b.currency, s.locale)}</Td>
                        {type === "BILL" ? <Td className="tabular text-right">{formatMoney(b.dueAmount, b.currency, s.locale)}</Td> : null}
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
