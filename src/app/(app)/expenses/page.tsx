import type { Metadata } from "next";
import Link from "next/link";
import { Paperclip, Plus, Receipt } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { Card, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { FilterBar, NoResults, Pagination, SortHeader } from "@/components/list";
import { BulkDelete, BulkProvider, RowCheck, SelectAll } from "@/components/bulk";
import { RowActions } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate, parseIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pageMeta, parseList, type SearchParams } from "@/lib/list";
import { deleteExpensesAction } from "./actions";

export const metadata: Metadata = { title: "Expenses" };
const SORTS = ["expenseDate", "amount", "expenseNumber"] as const;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-expense")) return <Forbidden />;
  const sp = await searchParams;
  const p = parseList(sp, SORTS, "expenseDate", "desc");
  const where: Prisma.ExpenseWhereInput = { companyId: ctx.companyId };
  if (p.q("customer")) where.customerId = Number(p.q("customer")) || undefined;
  if (p.q("category")) where.categoryId = Number(p.q("category")) || undefined;
  const from = parseIsoDate(p.q("from"));
  const to = parseIsoDate(p.q("to"));
  if (from && to) where.expenseDate = { gte: from, lte: to };
  const [totalAll, total, customers, categories] = await Promise.all([
    db.expense.count({ where: { companyId: ctx.companyId } }),
    db.expense.count({ where }),
    db.customer.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.expenseCategory.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
  ]);
  const meta = pageMeta(total, p);
  const rows = await db.expense.findMany({ where, include: { category: true, customer: { select: { name: true } } }, orderBy: [{ [p.sort]: p.dir }, { id: "desc" }], skip: meta.skip, take: meta.take });
  const s = ctx.settings;
  const base = "/expenses";
  const canDelete = ctx.can("delete-expense");
  return (
    <>
      <PageHeader title="Expenses" actions={ctx.can("create-expense") ? <ButtonLink href="/expenses/new"><Plus className="h-4 w-4" aria-hidden="true" /> New expense</ButtonLink> : null} />
      <Card>
        {totalAll === 0 ? (
          <EmptyState icon={<Receipt className="h-6 w-6" aria-hidden="true" />} title="No expenses yet" description="Track what you spend, attach receipts and see it in profit and loss." action={ctx.can("create-expense") ? <ButtonLink href="/expenses/new">New expense</ButtonLink> : undefined} />
        ) : (
          <BulkProvider>
            <FilterBar
              sp={sp}
              basePath={base}
              filters={[
                { name: "customer", label: "Customer", type: "select", options: customers.map((c) => ({ value: String(c.id), label: c.name })) },
                { name: "category", label: "Category", type: "select", options: categories.map((c) => ({ value: String(c.id), label: c.name })) },
                { name: "from", label: "From date", type: "date" },
                { name: "to", label: "To date", type: "date" },
              ]}
            />
            {canDelete ? <BulkDelete action={deleteExpensesAction} noun="expenses" /> : null}
            {rows.length === 0 ? (
              <NoResults />
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full divide-y divide-line text-sm">
                  <thead>
                    <tr>
                      {canDelete ? <Th className="w-10"><SelectAll ids={rows.map((r) => r.id)} /></Th> : null}
                      <SortHeader label="Date" field="expenseDate" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <SortHeader label="Number" field="expenseNumber" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <Th>Category</Th>
                      <Th>Customer</Th>
                      <Th>Notes</Th>
                      <SortHeader label="Amount" field="amount" sp={sp} sort={p.sort} dir={p.dir} basePath={base} align="right" />
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {rows.map((e) => (
                      <tr key={e.id} className="hover:bg-canvas">
                        {canDelete ? <Td><RowCheck id={e.id} label={`expense ${e.id}`} /></Td> : null}
                        <Td className="text-muted">{formatDate(isoDate(e.expenseDate), s.date_format)}</Td>
                        <Td>{e.expenseNumber ?? "—"}</Td>
                        <Td className="font-medium">{e.category.name} {e.receiptPath ? <Paperclip className="inline h-3.5 w-3.5 text-slate-400" aria-label="Has receipt" /> : null}</Td>
                        <Td className="text-muted">{e.customer?.name ?? "—"}</Td>
                        <Td className="max-w-[14rem] truncate text-muted">{e.notes}</Td>
                        <Td className="tabular text-right">{formatMoney(e.amount, e.currency, s.locale)}</Td>
                        <Td>
                          <div className="flex items-center justify-end gap-2">
                            {ctx.can("edit-expense") ? <Link href={`/expenses/${e.id}/edit`} className="text-sm text-brand-700 hover:underline focus-ring rounded">Edit</Link> : null}
                            {canDelete ? <RowActions deleteAction={deleteExpensesAction.bind(null, [e.id])} deleteTitle="Delete this expense?" /> : null}
                          </div>
                        </Td>
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
