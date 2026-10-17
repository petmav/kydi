import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { Badge, Card, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { FilterBar, NoResults, Pagination, SortHeader } from "@/components/list";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { pageMeta, parseList, type SearchParams } from "@/lib/list";
import { supplierBalances } from "@/server/purchasing";

export const metadata: Metadata = { title: "Suppliers" };

const SORTS = ["name", "currency", "createdAt"] as const;

/** Spec §5.9: suppliers list (name, email/phone, currency, balance due, enabled). */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-supplier")) return <Forbidden />;
  const sp = await searchParams;
  const p = parseList(sp, SORTS, "name", "asc");
  const where: Prisma.SupplierWhereInput = { companyId: ctx.companyId };
  if (p.q("name")) where.OR = [{ name: { contains: p.q("name"), mode: "insensitive" } }, { email: { contains: p.q("name"), mode: "insensitive" } }, { contactName: { contains: p.q("name"), mode: "insensitive" } }];
  if (p.q("status")) where.enabled = p.q("status") === "enabled";
  const [totalAll, total] = await Promise.all([db.supplier.count({ where: { companyId: ctx.companyId } }), db.supplier.count({ where })]);
  const meta = pageMeta(total, p);
  const rows = await db.supplier.findMany({ where, orderBy: [{ [p.sort]: p.dir }, { id: "asc" }], skip: meta.skip, take: meta.take });
  const balances = await supplierBalances(ctx.companyId, rows.map((r) => r.id));
  const base = "/suppliers";
  const s = ctx.settings;
  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Businesses you buy from."
        actions={
          ctx.can("create-supplier") ? (
            <ButtonLink href="/suppliers/new">
              <Plus className="h-4 w-4" aria-hidden="true" /> New supplier
            </ButtonLink>
          ) : null
        }
      />
      <Card>
        {totalAll === 0 ? (
          <EmptyState icon={<Truck className="h-6 w-6" aria-hidden="true" />} title="No suppliers yet" description="Add a supplier to record bills and payments." action={ctx.can("create-supplier") ? <ButtonLink href="/suppliers/new">New supplier</ButtonLink> : undefined} />
        ) : (
          <>
            <FilterBar
              sp={sp}
              basePath={base}
              filters={[
                { name: "name", label: "Name, email or contact" },
                { name: "status", label: "Status", type: "select", options: [{ value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }] },
              ]}
            />
            {rows.length === 0 ? (
              <NoResults />
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full divide-y divide-line text-sm">
                  <thead>
                    <tr>
                      <SortHeader label="Name" field="name" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <Th>Email / phone</Th>
                      <SortHeader label="Currency" field="currency" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <Th className="text-right">Balance due</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-canvas">
                        <Td>
                          <Link href={`/suppliers/${r.id}`} className="font-medium text-brand-700 hover:underline focus-ring rounded">
                            {r.name}
                          </Link>
                          {r.contactName ? <p className="text-xs text-muted">{r.contactName}</p> : null}
                        </Td>
                        <Td className="text-muted">{[r.email, r.phone].filter(Boolean).join(" · ") || "—"}</Td>
                        <Td>{r.currency}</Td>
                        <Td className="tabular text-right">{formatMoney(balances.get(r.id)?.due ?? 0, r.currency, s.locale)}</Td>
                        <Td>{r.enabled ? <Badge tone="green">Enabled</Badge> : <Badge>Disabled</Badge>}</Td>
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
