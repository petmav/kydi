import Link from "next/link";
import { Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { Card, inputClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { withParams, type SearchParams } from "@/lib/list";
import { cn } from "@/lib/utils";
import { customerBalances } from "@/server/customers";

const LIMIT = 50;

/** Left pane of the customer split view (spec §5.2): searchable, sortable list for quick switching. */
export async function CustomerSwitcher({ companyId, currentId, sp, locale }: { companyId: number; currentId: number; sp: SearchParams; locale: string }) {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = one("lq").trim();
  const sort = one("ls") === "balance" ? "balance" : "name";
  const where: Prisma.CustomerWhereInput = { companyId };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
    ];
  }
  const total = await db.customer.count({ where });
  let rows: { id: number; name: string; currency: string }[];
  let balances: Awaited<ReturnType<typeof customerBalances>>;
  if (sort === "balance") {
    const all = await db.customer.findMany({ where, select: { id: true, name: true, currency: true } });
    balances = await customerBalances(companyId, all.map((c) => c.id));
    rows = all.sort((a, b) => balances.get(b.id)!.baseDue - balances.get(a.id)!.baseDue || a.name.localeCompare(b.name)).slice(0, LIMIT);
  } else {
    rows = await db.customer.findMany({ where, select: { id: true, name: true, currency: true }, orderBy: { name: "asc" }, take: LIMIT });
    balances = await customerBalances(companyId, rows.map((c) => c.id));
  }
  const keep = { lq: q || undefined, ls: sort === "balance" ? "balance" : undefined };
  return (
    <Card className="lg:sticky lg:top-20">
      <form method="get" className="border-b border-line p-3" role="search">
        <label htmlFor="customer-switch-q" className="sr-only">
          Search customers
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input id="customer-switch-q" name="lq" defaultValue={q} placeholder="Search customers" className={cn(inputClass, "pl-8")} />
        </div>
        {sort === "balance" ? <input type="hidden" name="ls" value="balance" /> : null}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          <span>Sort by</span>
          {(["name", "balance"] as const).map((s) => (
            <Link
              key={s}
              href={`/customers/${currentId}${withParams({}, { lq: q || undefined, ls: s === "balance" ? "balance" : undefined })}`}
              aria-current={sort === s ? "true" : undefined}
              className={cn("rounded px-1.5 py-0.5 focus-ring", sort === s ? "bg-subtle font-medium text-ink" : "hover:text-ink")}
            >
              {s === "name" ? "Name" : "Balance"}
            </Link>
          ))}
        </div>
      </form>
      <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto" aria-label="Customers">
        {rows.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted">No customers match.</li> : null}
        {rows.map((c) => {
          const active = c.id === currentId;
          return (
            <li key={c.id}>
              <Link
                href={`/customers/${c.id}${withParams({}, keep)}`}
                aria-current={active ? "page" : undefined}
                className={cn("flex items-center justify-between gap-2 px-4 py-2 text-sm focus-ring", active ? "bg-brand-50 font-medium text-brand-900" : "hover:bg-subtle")}
              >
                <span className="truncate">{c.name}</span>
                <span className="tabular shrink-0 text-xs text-muted">{formatMoney(balances.get(c.id)?.due ?? 0, c.currency, locale)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {total > rows.length ? <p className="border-t border-line px-4 py-2 text-xs text-muted">Showing {rows.length} of {total}. Search to narrow the list.</p> : null}
    </Card>
  );
}
