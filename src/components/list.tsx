import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { PAGE_SIZES, withParams, type SearchParams } from "@/lib/list";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";

export function SortHeader({
  label,
  field,
  sp,
  sort,
  dir,
  basePath,
  align = "left",
}: {
  label: string;
  field: string;
  sp: SearchParams;
  sort: string;
  dir: string;
  basePath: string;
  align?: "left" | "right";
}) {
  const active = sort === field;
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "sticky top-0 z-10 whitespace-nowrap border-b border-line bg-subtle px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <Link href={`${basePath}${withParams(sp, { sort: field, dir: nextDir, page: undefined })}`} className="inline-flex items-center gap-1 rounded hover:text-ink focus-ring">
        {label}
        {active ? dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" /> : null}
      </Link>
    </th>
  );
}

export function Pagination({ sp, basePath, page, lastPage, total, limit }: { sp: SearchParams; basePath: string; page: number; lastPage: number; total: number; limit: number }) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
      <div className="flex items-center gap-2">
        <span>
          Showing <span className="tabular font-medium text-ink">{from}</span>–<span className="tabular font-medium text-ink">{to}</span> of{" "}
          <span className="tabular font-medium text-ink">{total}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span>Rows per page:</span>
        {PAGE_SIZES.map((s) => (
          <Link
            key={s}
            href={`${basePath}${withParams(sp, { limit: s, page: undefined })}`}
            aria-current={s === limit ? "true" : undefined}
            className={cn("rounded px-1.5 py-0.5 focus-ring", s === limit ? "bg-subtle font-medium text-ink" : "hover:text-ink")}
          >
            {s}
          </Link>
        ))}
      </div>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <Link
          href={`${basePath}${withParams(sp, { page: page - 1 })}`}
          aria-disabled={page <= 1}
          className={cn(buttonClass("secondary", "sm"), page <= 1 && "pointer-events-none opacity-50")}
          tabIndex={page <= 1 ? -1 : undefined}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
        </Link>
        <span className="tabular px-2">
          Page {page} of {lastPage}
        </span>
        <Link
          href={`${basePath}${withParams(sp, { page: page + 1 })}`}
          aria-disabled={page >= lastPage}
          className={cn(buttonClass("secondary", "sm"), page >= lastPage && "pointer-events-none opacity-50")}
          tabIndex={page >= lastPage ? -1 : undefined}
        >
          Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </nav>
    </div>
  );
}

export type FilterDef =
  | { name: string; label: string; type?: "text" | "date" }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[] };

/** GET filter bar; keeps sort/limit, resets page. */
export function FilterBar({ filters, sp, basePath }: { filters: FilterDef[]; sp: SearchParams; basePath: string }) {
  const val = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const active = filters.some((f) => val(f.name));
  return (
    <form method="get" action={basePath} className="flex flex-wrap items-end gap-3 border-b border-line bg-white px-4 py-3" role="search">
      {["sort", "dir", "limit", "tab"].map((k) => (val(k) ? <input key={k} type="hidden" name={k} value={val(k)} /> : null))}
      {filters.map((f) => (
        <div key={f.name} className="min-w-[10rem] flex-1 sm:max-w-[14rem]">
          <label htmlFor={`f-${f.name}`} className="mb-1 block text-xs font-medium text-muted">
            {f.label}
          </label>
          {f.type === "select" ? (
            <select id={`f-${f.name}`} name={f.name} defaultValue={val(f.name)} className={cn(inputClass, "py-1.5")}>
              <option value="">All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input id={`f-${f.name}`} name={f.name} type={f.type ?? "text"} defaultValue={val(f.name)} className={cn(inputClass, "py-1.5")} />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <button type="submit" className={buttonClass("secondary", "sm")}>
          Apply
        </button>
        {active ? (
          <Link href={`${basePath}${withParams(sp, Object.fromEntries(filters.map((f) => [f.name, undefined])))}`} className={cn(buttonClass("ghost", "sm"), "text-brand-700")}>
            Clear all
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function Tabs({ tabs, current, basePath, sp }: { tabs: { key: string; label: string }[]; current: string; basePath: string; sp: SearchParams }) {
  return (
    <nav className="flex gap-4 border-b border-line px-4" aria-label="Views">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${basePath}${withParams(sp, { tab: t.key, page: undefined })}`}
          aria-current={current === t.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-1 py-2.5 text-sm font-medium focus-ring",
            current === t.key ? "border-brand-700 text-brand-800" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function NoResults({ children }: { children?: ReactNode }) {
  return <div className="px-6 py-12 text-center text-sm text-muted">{children ?? "No records match the current filters."}</div>;
}
