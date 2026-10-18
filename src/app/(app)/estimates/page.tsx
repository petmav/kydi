import type { Metadata } from "next";
import Link from "next/link";
import { FileSignature, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { Card, EmptyState, PageHeader, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { FilterBar, NoResults, Pagination, SortHeader, Tabs } from "@/components/list";
import { BulkDelete, BulkProvider, RowCheck, SelectAll } from "@/components/bulk";
import { StatusBadge } from "@/components/status-badges";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate, parseIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pageMeta, parseList, type SearchParams } from "@/lib/list";
import { deleteEstimatesAction } from "./actions";

export const metadata: Metadata = { title: "Estimates" };
const SORTS = ["sequenceNumber", "estimateDate", "estimateNumber", "total"] as const;
const TABS = [
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "all", label: "All" },
];
const STATUSES = ["DRAFT", "SENT", "VIEWED", "EXPIRED", "ACCEPTED", "REJECTED"];

export default async function EstimatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-estimate")) return <Forbidden />;
  const sp = await searchParams;
  const p = parseList(sp, SORTS, "sequenceNumber", "desc");
  const tab = TABS.some((t) => t.key === p.q("tab")) ? p.q("tab") : "all";
  const where: Prisma.EstimateWhereInput = { companyId: ctx.companyId };
  if (tab === "draft") where.status = "DRAFT";
  if (tab === "sent") where.status = "SENT";
  if (p.q("customer")) where.customerId = Number(p.q("customer")) || undefined;
  if (STATUSES.includes(p.q("status"))) where.status = p.q("status") as Prisma.EstimateWhereInput["status"];
  const from = parseIsoDate(p.q("from"));
  const to = parseIsoDate(p.q("to"));
  if (from && to) where.estimateDate = { gte: from, lte: to };
  if (p.q("number")) where.estimateNumber = { contains: p.q("number"), mode: "insensitive" };
  const [totalAll, total, customers] = await Promise.all([
    db.estimate.count({ where: { companyId: ctx.companyId } }),
    db.estimate.count({ where }),
    db.customer.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const meta = pageMeta(total, p);
  const rows = await db.estimate.findMany({ where, include: { customer: { select: { name: true } } }, orderBy: [{ [p.sort]: p.dir }, { id: "desc" }], skip: meta.skip, take: meta.take });
  const s = ctx.settings;
  const base = "/estimates";
  const canDelete = ctx.can("delete-estimate");
  return (
    <>
      <PageHeader title="Estimates" actions={ctx.can("create-estimate") ? <ButtonLink href="/estimates/new"><Plus className="h-4 w-4" aria-hidden="true" /> New estimate</ButtonLink> : null} />
      <Card>
        {totalAll === 0 ? (
          <EmptyState icon={<FileSignature className="h-6 w-6" aria-hidden="true" />} title="No estimates yet" description="Send a quote, then convert it to an invoice once accepted." action={ctx.can("create-estimate") ? <ButtonLink href="/estimates/new">New estimate</ButtonLink> : undefined} />
        ) : (
          <BulkProvider>
            <Tabs tabs={TABS} current={tab} basePath={base} sp={sp} />
            <FilterBar
              sp={sp}
              basePath={base}
              filters={[
                { name: "customer", label: "Customer", type: "select", options: customers.map((c) => ({ value: String(c.id), label: c.name })) },
                { name: "status", label: "Status", type: "select", options: STATUSES.map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() })) },
                { name: "from", label: "From date", type: "date" },
                { name: "to", label: "To date", type: "date" },
                { name: "number", label: "Estimate number" },
              ]}
            />
            {canDelete ? <BulkDelete action={deleteEstimatesAction} noun="estimates" /> : null}
            {rows.length === 0 ? (
              <NoResults />
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full divide-y divide-line text-sm" data-tour="records-table">
                  <thead>
                    <tr>
                      {canDelete ? <Th className="w-10"><SelectAll ids={rows.map((r) => r.id)} /></Th> : null}
                      <SortHeader label="Date" field="estimateDate" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <SortHeader label="Number" field="estimateNumber" sp={sp} sort={p.sort} dir={p.dir} basePath={base} />
                      <Th>Customer</Th>
                      <Th>Status</Th>
                      <SortHeader label="Total" field="total" sp={sp} sort={p.sort} dir={p.dir} basePath={base} align="right" />
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {rows.map((e) => (
                      <tr key={e.id} className="hover:bg-canvas">
                        {canDelete ? <Td><RowCheck id={e.id} label={e.estimateNumber} /></Td> : null}
                        <Td className="text-muted">{formatDate(isoDate(e.estimateDate), s.date_format)}</Td>
                        <Td><Link href={`/estimates/${e.id}`} className="font-medium text-brand-800 hover:underline focus-ring rounded">{e.estimateNumber}</Link></Td>
                        <Td>{e.customer.name}</Td>
                        <Td><StatusBadge kind="est" value={e.status} /></Td>
                        <Td className="tabular text-right">{formatMoney(e.total, e.currency, s.locale)}</Td>
                        <Td className="text-right"><Link href={`/estimates/${e.id}`} className="text-sm text-brand-700 hover:underline focus-ring rounded">View</Link></Td>
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
