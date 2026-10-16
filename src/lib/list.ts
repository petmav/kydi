/** Server-side list parameters (spec §9.1 / §5.0): page, limit (10/25/50/100), sort, direction, filters. */

export type SearchParams = Record<string, string | string[] | undefined>;

export type ListParams<S extends string> = {
  page: number;
  limit: number;
  sort: S;
  dir: "asc" | "desc";
  q: (key: string) => string;
  raw: SearchParams;
};

export const PAGE_SIZES = [10, 25, 50, 100];

export function parseList<S extends string>(sp: SearchParams, sortable: readonly S[], defaultSort: S, defaultDir: "asc" | "desc" = "desc"): ListParams<S> {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const limit = Number(one("limit"));
  const sort = one("sort") as S;
  const dir = one("dir");
  return {
    page: Math.max(1, Number(one("page")) || 1),
    limit: PAGE_SIZES.includes(limit) ? limit : 10,
    sort: sortable.includes(sort) ? sort : defaultSort,
    dir: dir === "asc" || dir === "desc" ? dir : defaultDir,
    q: (k: string) => one(k).trim(),
    raw: sp,
  };
}

export function pageMeta(total: number, p: { page: number; limit: number }) {
  const lastPage = Math.max(1, Math.ceil(total / p.limit));
  return { total, page: Math.min(p.page, lastPage), lastPage, skip: (Math.min(p.page, lastPage) - 1) * p.limit, take: p.limit };
}

/** Builds a query string from current params with overrides (undefined/"" removes a key). */
export function withParams(sp: SearchParams, overrides: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) u.set(k, val);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === "") u.delete(k);
    else u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}
