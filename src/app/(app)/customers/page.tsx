import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { Card, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { FilterBar, NoResults, Pagination, SortHeader } from "@/components/list";
import { BulkDelete, BulkProvider, RowCheck, SelectAll } from "@/components/bulk";
import { RowActions } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pageMeta, parseList, type SearchParams } from "@/lib/list";
import { customerBalances } from "@/server/customers";
import { deleteCustomersAction } from "./actions";

export const metadata: Metadata = { title: "Customers" };

const SORTS = ["name", "phone", "due", "createdAt"] as const;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-customer")) return <Forbidden />;
  const sp = await searchParams;
  const p = parseList(sp, SORTS, "name", "asc");
  const where: Prisma.CustomerWhereInput = { companyId: ctx.companyId };
  if (p.q("name")) where.name = { contains: p.q("name"), mode: "insensitive" };
  if (p.q("contact")) where.contactName = { contains: p.q("contact"), mode: "insensitive" };
  if (p.q("phone")) where.phone = { contains: p.q("phone") };

  const [totalAll, total] = await Promise.all([db.customer.count({ where: { companyId: ctx.companyId } }), db.customer.count({ where })]);
  const meta = pageMeta(total, p);
  let rows;
  if (p.sort === "due") {
    // Sort by balance: compute balances for the filtered set, then page in memory.
    const all = await db.customer.findMany({ where, select: { id: true } });
    const bal = await customerBalances(ctx.companyId, all.map((c) => c.id));
    const ids = all
      .map((c) => c.id)
      .sort((a, b) => (bal.get(a)!.baseDue - bal.get(b)!.baseDue) * (p.dir === "asc" ? 1 : -1))
      .slice(meta.skip, meta.skip + meta.take);
    const found = await db.customer.findMany({ where: { id: { in: ids } } });
    rows = ids.map((id) => found.find((f) => f.id === id)!);
  } else {
    rows = await db.customer.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: meta.skip, take: meta.take });
  }
  const balances = await customerBalances(ctx.companyId, rows.map((r) => r.id));
  const s = ctx.settings;
  const base = "/customers";

  return (
    <>
      <PageHeader
        title="Customers"
        description="People and businesses you invoice."
        actions={
          ctx.can("create-customer") ? (
            <ButtonLink href="/customers/new">
              <Plus className="h-4 w-4" aria-hidden="true" /> New customer
            </ButtonLink>
          ) : null
        }
      />
      <Card>
        {totalAll === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" aria-hidden="true" />}
            title="No customers yet"
            description="Add your first customer to start sending estimates and invoices."
            action={ctx.can("create-customer") ? <ButtonLink href="/customers/new">Add customer</ButtonLink> : undefined}
          />
        ) : (
          <BulkProvider>
            <FilterBar
              sp={sp}
              basePath={base}
              filters={[
                { name: "name", label: "Display name" },
                { name: "contact", label: "Contact name" },
                { name: "phone", label: "Phone" },
              ]}
            />
            {ctx.can("delete-customer") ? (
              <BulkDelete action={deleteCustomersAction} noun="customers" warning="This also deletes all of their estimates, invoices, payments, expenses and recurring invoices. This cannot be undone." />
            ) : null}
            {rows.length === 0 ? (
              <NoResults />
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full divide-y divide-line text-sm">
                  <thead>
                    <tr>
                      {ctx.can("delete-customer") ? (
                        <Th className="w-10">
                          <SelectAll ids={rows.map((r) => r.id)} />
                        </Th>
                      ) : null}
                      <SortHeader label="Name" field="name" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <SortHeader label="Phone" field="phone" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <SortHeader label="Amount due" field="due" sp={sp} sort={p.sort} dir={p.dir} basePath={base} align="right" />
                      <SortHeader label="Added on" field="createdAt" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {rows.map((c) => (
                      <tr key={c.id} className="hover:bg-canvas">
                        {ctx.can("delete-customer") ? (
                          <Td>
                            <RowCheck id={c.id} label={c.name} />
                          </Td>
                        ) : null}
                        <Td>
                          <Link href={`/customers/${c.id}`} className="font-medium text-brand-800 hover:underline focus-ring rounded">
                            {c.name}
                          </Link>
                          {c.companyName || c.contactName ? <p className="text-xs text-muted">{c.companyName ?? c.contactName}</p> : null}
                        </Td>
                        <Td className="text-muted">{c.phone ?? "—"}</Td>
                        <Td className="tabular text-right">{formatMoney(balances.get(c.id)?.due ?? 0, c.currency, s.locale)}</Td>
                        <Td className="text-muted">{formatDate(isoDate(c.createdAt), s.date_format)}</Td>
                        <Td>
                          <div className="flex items-center justify-end gap-2">
                            {ctx.can("edit-customer") ? (
                              <Link href={`/customers/${c.id}/edit`} className="text-sm text-brand-700 hover:underline focus-ring rounded">
                                Edit
                              </Link>
                            ) : null}
                            {ctx.can("delete-customer") ? (
                              <RowActions
                                deleteAction={deleteCustomersAction.bind(null, [c.id])}
                                deleteTitle={`Delete ${c.name}?`}
                                deleteDescription="This also deletes all of their estimates, invoices, payments, expenses and recurring invoices."
                              />
                            ) : null}
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
