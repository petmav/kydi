import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
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
import { formatMoney, toMinor } from "@/lib/money";
import { pageMeta, parseList, type SearchParams } from "@/lib/list";
import { deleteItemsAction } from "./actions";

export const metadata: Metadata = { title: "Items" };
const SORTS = ["name", "price", "createdAt"] as const;

export default async function ItemsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-item")) return <Forbidden />;
  const sp = await searchParams;
  const p = parseList(sp, SORTS, "name", "asc");
  const where: Prisma.ItemWhereInput = { companyId: ctx.companyId };
  if (p.q("name")) where.name = { contains: p.q("name"), mode: "insensitive" };
  if (p.q("unit")) where.unitId = Number(p.q("unit")) || undefined;
  if (p.q("price") && Number.isFinite(toMinor(p.q("price")))) where.price = toMinor(p.q("price"));
  const [totalAll, total, units] = await Promise.all([
    db.item.count({ where: { companyId: ctx.companyId } }),
    db.item.count({ where }),
    db.unit.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
  ]);
  const meta = pageMeta(total, p);
  const rows = await db.item.findMany({ where, include: { unit: true }, orderBy: { [p.sort]: p.dir }, skip: meta.skip, take: meta.take });
  const s = ctx.settings;
  const base = "/items";
  const canDelete = ctx.can("delete-item");
  return (
    <>
      <PageHeader
        title="Items"
        description={`${totalAll} products and services in your catalogue.`}
        actions={ctx.can("create-item") ? <ButtonLink href="/items/new"><Plus className="h-4 w-4" aria-hidden="true" /> New item</ButtonLink> : null}
      />
      <Card>
        {totalAll === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" aria-hidden="true" />}
            title="No items yet"
            description="Save the products and services you sell to add them to documents quickly."
            action={ctx.can("create-item") ? <ButtonLink href="/items/new">Add item</ButtonLink> : undefined}
          />
        ) : (
          <BulkProvider>
            <FilterBar
              sp={sp}
              basePath={base}
              filters={[
                { name: "name", label: "Name" },
                { name: "unit", label: "Unit", type: "select", options: units.map((u) => ({ value: String(u.id), label: u.name })) },
                { name: "price", label: "Price" },
              ]}
            />
            {canDelete ? <BulkDelete action={deleteItemsAction} noun="items" warning="Documents keep their copy of the item details." /> : null}
            {rows.length === 0 ? (
              <NoResults />
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full divide-y divide-line text-sm">
                  <thead>
                    <tr>
                      {canDelete ? <Th className="w-10"><SelectAll ids={rows.map((r) => r.id)} /></Th> : null}
                      <SortHeader label="Name" field="name" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <Th>Unit</Th>
                      <SortHeader label="Price" field="price" sp={sp} sort={p.sort} dir={p.dir} basePath={base} align="right" />
                      <SortHeader label="Added on" field="createdAt" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {rows.map((it) => (
                      <tr key={it.id} className="hover:bg-canvas">
                        {canDelete ? <Td><RowCheck id={it.id} label={it.name} /></Td> : null}
                        <Td>
                          {ctx.can("edit-item") ? (
                            <Link href={`/items/${it.id}/edit`} className="font-medium text-brand-800 hover:underline focus-ring rounded">{it.name}</Link>
                          ) : (
                            <span className="font-medium">{it.name}</span>
                          )}
                          {it.description ? <p className="max-w-md truncate text-xs text-muted">{it.description}</p> : null}
                        </Td>
                        <Td className="text-muted">{it.unit?.name ?? "—"}</Td>
                        <Td className="tabular text-right">{formatMoney(it.price, s.currency, s.locale)}</Td>
                        <Td className="text-muted">{formatDate(isoDate(it.createdAt), s.date_format)}</Td>
                        <Td>
                          <div className="flex items-center justify-end gap-2">
                            {ctx.can("edit-item") ? <Link href={`/items/${it.id}/edit`} className="text-sm text-brand-700 hover:underline focus-ring rounded">Edit</Link> : null}
                            {canDelete ? <RowActions deleteAction={deleteItemsAction.bind(null, [it.id])} deleteTitle={`Delete ${it.name}?`} deleteDescription="Documents keep their copy of the item details." /> : null}
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
