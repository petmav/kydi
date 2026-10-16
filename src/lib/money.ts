/** Money helpers. All amounts are integers of minor units (major x 100), spec §3.0. */

export const MAX_MONEY = 999_999_999_999;

/** Trim float noise (e.g. 2.4999999997) before rounding. */
const clean = (x: number) => Math.round(x * 1e6) / 1e6;

/** R(x): round half up toward +infinity (spec §4.3). -2.5 -> -2. */
export function R(x: number): number {
  return Math.floor(clean(x) + 0.5);
}

/** Rh(x): round half away from zero. */
export function Rh(x: number): number {
  const c = clean(x);
  return Math.sign(c) * Math.floor(Math.abs(c) + 0.5);
}

/** Round to n decimals, half away from zero. */
export function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Rh(x * f) / f;
}

/** Parses a user-entered major amount ("1,234.50") into minor units. Returns NaN when invalid. */
export function toMinor(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return NaN;
  const s = String(input).trim().replace(/[\s,_]/g, "");
  if (s === "" || !/^-?\d*(\.\d*)?$/.test(s) || s === "." || s === "-") return NaN;
  return Rh(Number(s) * 100);
}

export function fromMinor(minor: number | bigint): number {
  return Number(minor) / 100;
}

/** Major-unit string for form inputs (no grouping). */
export function minorToInput(minor: number | bigint | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  return (Number(minor) / 100).toFixed(2);
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function formatter(currency: string, locale: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, { style: "currency", currency });
    } catch {
      f = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    }
    fmtCache.set(key, f);
  }
  return f;
}

export function formatMoney(minor: number | bigint | null | undefined, currency: string, locale = "en-US"): string {
  return formatter(currency, locale).format(Number(minor ?? 0) / 100);
}

/** Display precision for a currency (e.g. JPY -> 0). */
export function currencyPrecision(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function currencySymbol(currency: string, locale = "en-US"): string {
  try {
    return (
      new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/** base_x = R(x * exchange_rate) */
export function toBase(minor: number, rate: number): number {
  return R(minor * rate);
}

// ---- BigInt <-> number bridging for Prisma results ---------------------------
export type Plain<T> = T extends bigint
  ? number
  : T extends Date
    ? Date
    : T extends Array<infer U>
      ? Plain<U>[]
      : T extends object
        ? { [K in keyof T]: Plain<T[K]> }
        : T;

/** Deeply converts bigint values to numbers (safe: |money| <= 1e12 < 2^53). */
export function plain<T>(value: T): Plain<T> {
  if (typeof value === "bigint") return Number(value) as Plain<T>;
  if (value === null || value === undefined || typeof value !== "object" || value instanceof Date) return value as Plain<T>;
  if (Array.isArray(value)) return value.map((v) => plain(v)) as Plain<T>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = plain(v);
  return out as Plain<T>;
}
