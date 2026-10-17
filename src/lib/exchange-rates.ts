import { isPublicHttpUrl } from "@/lib/net";

/** Exchange-rate provider drivers (spec §3.16). Pure request building and response parsing; no I/O. */

export const RATE_DRIVERS = ["currency_converter", "currency_freak", "currency_layer", "open_exchange_rate"] as const;
export type RateDriver = (typeof RATE_DRIVERS)[number];

export const RATE_DRIVER_LABELS: Record<RateDriver, string> = {
  currency_converter: "Currency Converter",
  currency_freak: "CurrencyFreaks",
  currency_layer: "Currencylayer",
  open_exchange_rate: "Open Exchange Rates",
};

export const CONVERTER_PLANS = [
  { value: "FREE", label: "Free" },
  { value: "PREPAID", label: "Prepaid" },
  { value: "PREMIUM", label: "Premium" },
  { value: "DEDICATED", label: "Dedicated (custom URL)" },
] as const;

const CONVERTER_HOSTS: Record<string, string> = {
  FREE: "https://free.currconv.com",
  PREPAID: "https://prepaid.currconv.com",
  PREMIUM: "https://api.currconv.com",
};

export function isRateDriver(v: unknown): v is RateDriver {
  return typeof v === "string" && (RATE_DRIVERS as readonly string[]).includes(v);
}

export type DriverConfig = { planType?: string; url?: string };

/** Builds the provider URL for "1 <foreign> = x <base>". Returns null when the configuration is unusable. */
export function rateRequestUrl(driver: RateDriver, key: string, config: DriverConfig, foreign: string, base: string): string | null {
  const k = encodeURIComponent(key);
  const pair = `${foreign},${base}`;
  switch (driver) {
    case "currency_converter": {
      const plan = config.planType ?? "FREE";
      const root = plan === "DEDICATED" ? (config.url ?? "").replace(/\/+$/, "") : CONVERTER_HOSTS[plan];
      if (!root || (plan === "DEDICATED" && !isPublicHttpUrl(root))) return null;
      return `${root}/api/v7/convert?q=${foreign}_${base}&compact=ultra&apiKey=${k}`;
    }
    case "currency_freak":
      return `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${k}&symbols=${pair}`;
    case "currency_layer":
      return `https://api.currencylayer.com/live?access_key=${k}&currencies=${pair}`;
    case "open_exchange_rate":
      return `https://openexchangerates.org/api/latest.json?app_id=${k}&symbols=${pair}`;
  }
}

/** Rounds to the 6 decimals the documents store. */
export function roundRate(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/**
 * Cross rate from quotes against a common source currency S (rates[X] = units of X per 1 S):
 * 1 foreign = rates[base] / rates[foreign] base. S itself counts as 1.
 */
export function crossRate(rates: Record<string, number>, source: string, foreign: string, base: string): number | null {
  const of = (c: string) => (c === source ? 1 : rates[c]);
  const f = of(foreign);
  const b = of(base);
  if (!(typeof f === "number" && f > 0 && Number.isFinite(f)) || !(typeof b === "number" && b > 0 && Number.isFinite(b))) return null;
  return roundRate(b / f);
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

/** Parses a provider response into "1 foreign = x base", or null when the payload has no usable quote. */
export function parseRateResponse(driver: RateDriver, json: unknown, foreign: string, base: string): number | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  switch (driver) {
    case "currency_converter": {
      const v = num(o[`${foreign}_${base}`]);
      return v > 0 && Number.isFinite(v) ? roundRate(v) : null;
    }
    case "currency_freak":
    case "open_exchange_rate": {
      const raw = (o.rates ?? {}) as Record<string, unknown>;
      const rates = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, num(v)]));
      return crossRate(rates, typeof o.base === "string" ? o.base : "USD", foreign, base);
    }
    case "currency_layer": {
      if (o.success === false) return null;
      const source = typeof o.source === "string" ? o.source : "USD";
      const quotes = (o.quotes ?? {}) as Record<string, unknown>;
      const rates: Record<string, number> = {};
      for (const [k, v] of Object.entries(quotes)) if (k.startsWith(source)) rates[k.slice(source.length)] = num(v);
      return crossRate(rates, source, foreign, base);
    }
  }
}

/** Currencies already served by another active provider (spec: one active provider per currency). */
export function currencyConflicts(selected: string[], others: { id: number; currencies: string[]; active: boolean }[], selfId: number | null): string[] {
  const taken = new Set(others.filter((p) => p.active && p.id !== selfId).flatMap((p) => p.currencies));
  return selected.filter((c) => taken.has(c));
}
