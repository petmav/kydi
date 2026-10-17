import { z } from "zod";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { isCurrency } from "@/lib/intl-data";
import { isPublicHttpUrl } from "@/lib/net";
import { currencyConflicts, isRateDriver, parseRateResponse, rateRequestUrl, RATE_DRIVERS, type DriverConfig, type RateDriver } from "@/lib/exchange-rates";
import type { FieldErrors } from "@/lib/action";

/** Exchange-rate providers and the rate lookup chain (spec §3.16, §4.12). */

export type ProviderResult = { ok: true; id: number } | { ok: false; error: string; fieldErrors?: FieldErrors; code?: string };

export const providerSchema = z.object({
  driver: z.enum(RATE_DRIVERS, { errorMap: () => ({ message: "Choose a provider." }) }),
  key: z.string().trim().max(200).default(""),
  currencies: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.string().trim().toUpperCase())),
  planType: z.string().optional(),
  url: z.string().trim().max(500).optional(),
  active: z.union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal(""), z.literal("false"), z.literal("0")]).optional().transform((v) => v === "on" || v === "true" || v === "1"),
});

/** Browser-safe list: the key is only reported as present. */
export async function listProviders(companyId: number) {
  const rows = await db.exchangeRateProvider.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    driver: r.driver as RateDriver,
    currencies: r.currencies,
    active: r.active,
    planType: ((r.driverConfig ?? {}) as DriverConfig).planType ?? "FREE",
    url: ((r.driverConfig ?? {}) as DriverConfig).url ?? "",
    hasKey: !!r.keyEncrypted,
  }));
}

export async function saveProvider(companyId: number, id: number | null, input: z.infer<typeof providerSchema>): Promise<ProviderResult> {
  const existing = id ? await db.exchangeRateProvider.findFirst({ where: { id, companyId } }) : null;
  if (id && !existing) return { ok: false, error: "Provider not found." };
  const errors: FieldErrors = {};
  if (!input.key && !existing) errors.key = ["Enter the API key."];
  const currencies = [...new Set(input.currencies)];
  if (!currencies.length) errors.currencies = ["Select at least one currency."];
  const invalid = currencies.filter((c) => !isCurrency(c));
  if (invalid.length) errors.currencies = [`Unknown currency: ${invalid.join(", ")}.`];
  const config: DriverConfig = {};
  if (input.driver === "currency_converter") {
    config.planType = ["FREE", "PREPAID", "PREMIUM", "DEDICATED"].includes(input.planType ?? "") ? input.planType : "FREE";
    if (config.planType === "DEDICATED") {
      if (!input.url || !isPublicHttpUrl(input.url)) errors.url = ["Enter a public http(s) URL."];
      else config.url = input.url;
    }
  }
  if (input.active && currencies.length) {
    const others = await db.exchangeRateProvider.findMany({ where: { companyId }, select: { id: true, currencies: true, active: true } });
    const clash = currencyConflicts(currencies, others, id);
    if (clash.length) errors.currencies = [`Already served by another active provider: ${clash.join(", ")}.`];
  }
  if (Object.keys(errors).length) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: errors };
  const keyEncrypted = input.key ? encryptSecret(input.key) : existing!.keyEncrypted;
  const data = { driver: input.driver, keyEncrypted, currencies, driverConfig: config, active: input.active };
  const row = existing
    ? await db.exchangeRateProvider.update({ where: { id: existing.id }, data })
    : await db.exchangeRateProvider.create({ data: { ...data, companyId } });
  clearRateCache();
  return { ok: true, id: row.id };
}

export async function setProviderActive(companyId: number, id: number, active: boolean): Promise<ProviderResult> {
  const p = await db.exchangeRateProvider.findFirst({ where: { id, companyId } });
  if (!p) return { ok: false, error: "Provider not found." };
  if (active) {
    const others = await db.exchangeRateProvider.findMany({ where: { companyId }, select: { id: true, currencies: true, active: true } });
    const clash = currencyConflicts(p.currencies, others, id);
    if (clash.length) return { ok: false, error: `Already served by another active provider: ${clash.join(", ")}.` };
  }
  await db.exchangeRateProvider.update({ where: { id }, data: { active } });
  clearRateCache();
  return { ok: true, id };
}

export async function deleteProvider(companyId: number, id: number): Promise<ProviderResult> {
  const p = await db.exchangeRateProvider.findFirst({ where: { id, companyId } });
  if (!p) return { ok: false, error: "Provider not found." };
  if (p.active) return { ok: false, error: "Deactivate the provider before deleting it.", code: "provider_active" };
  await db.exchangeRateProvider.delete({ where: { id } });
  return { ok: true, id };
}

// ---- lookup -----------------------------------------------------------------------------

const cache = new Map<string, { rate: number; at: number }>();
const TTL_MS = 10 * 60 * 1000;

function clearRateCache() {
  cache.clear();
}

/** Live quote from one provider; throws with a short reason on failure (never includes the key). */
export async function fetchProviderRate(p: { id: number; driver: string; keyEncrypted: string; driverConfig: unknown }, foreign: string, base: string): Promise<number> {
  if (!isRateDriver(p.driver)) throw new Error("Unknown provider.");
  const key = decryptSecret(p.keyEncrypted);
  if (!key) throw new Error("The stored API key cannot be read. Enter it again.");
  const url = rateRequestUrl(p.driver, key, (p.driverConfig ?? {}) as DriverConfig, foreign, base);
  if (!url) throw new Error("The provider URL is not allowed.");
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" }, redirect: "error" });
  if (!res.ok) throw new Error(`The provider answered HTTP ${res.status}.`);
  const rate = parseRateResponse(p.driver, await res.json(), foreign, base);
  if (rate === null) throw new Error(`The provider returned no rate for ${foreign}/${base}.`);
  return rate;
}

export type RateLookup = { rate: number; source: "provider" | "log" } | null;

/** Spec §3.16 lookup order: live quote from an active provider listing the currency → last logged rate → none. */
export async function lookupRate(companyId: number, foreign: string, base: string): Promise<RateLookup> {
  if (foreign === base) return { rate: 1, source: "log" };
  const provider = await db.exchangeRateProvider.findFirst({ where: { companyId, active: true, currencies: { has: foreign } } });
  if (provider) {
    const k = `${provider.id}:${foreign}:${base}`;
    const hit = cache.get(k);
    if (hit && Date.now() - hit.at < TTL_MS) return { rate: hit.rate, source: "provider" };
    try {
      const rate = await fetchProviderRate(provider, foreign, base);
      cache.set(k, { rate, at: Date.now() });
      return { rate, source: "provider" };
    } catch (e) {
      console.warn(`[kydi] exchange-rate provider ${provider.id} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  const row = await db.exchangeRateLog.findFirst({ where: { companyId, currency: foreign }, orderBy: { createdAt: "desc" } });
  return row ? { rate: row.rate, source: "log" } : null;
}
