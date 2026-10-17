import { describe, expect, it } from "vitest";
import { crossRate, currencyConflicts, parseRateResponse, rateRequestUrl, roundRate } from "@/lib/exchange-rates";

describe("exchange-rate maths", () => {
  it("computes cross rates from USD-based quotes", () => {
    // 1 EUR = 83.1 / 0.92 INR = 90.32608695... -> 90.326087
    expect(crossRate({ EUR: 0.92, INR: 83.1 }, "USD", "EUR", "INR")).toBe(90.326087);
    // 1 USD = 83.1 INR (source counts as 1)
    expect(crossRate({ INR: 83.1 }, "USD", "USD", "INR")).toBe(83.1);
    // 1 EUR = 1 / 0.92 USD = 1.0869565... -> 1.086957
    expect(crossRate({ EUR: 0.92 }, "USD", "EUR", "USD")).toBe(1.086957);
  });

  it("returns null for missing or invalid quotes", () => {
    expect(crossRate({ EUR: 0.92 }, "USD", "GBP", "EUR")).toBeNull();
    expect(crossRate({ EUR: 0, INR: 83 }, "USD", "EUR", "INR")).toBeNull();
    expect(crossRate({ EUR: Number.NaN, INR: 83 }, "USD", "EUR", "INR")).toBeNull();
  });

  it("rounds to six decimals", () => {
    expect(roundRate(1.2345671)).toBe(1.234567);
    expect(roundRate(1.23456789)).toBe(1.234568);
  });
});

describe("provider responses", () => {
  it("Currency Converter: direct pair value", () => {
    expect(parseRateResponse("currency_converter", { EUR_INR: 90.12 }, "EUR", "INR")).toBe(90.12);
    expect(parseRateResponse("currency_converter", { error: "bad key" }, "EUR", "INR")).toBeNull();
  });

  it("CurrencyFreaks: string rates against USD", () => {
    expect(parseRateResponse("currency_freak", { base: "USD", rates: { EUR: "0.92", INR: "83.1" } }, "EUR", "INR")).toBe(90.326087);
  });

  it("Currencylayer: USD-prefixed quotes; failure payloads give null", () => {
    // 1 GBP = 0.92 / 0.79 EUR = 1.16455696... -> 1.164557
    expect(parseRateResponse("currency_layer", { success: true, source: "USD", quotes: { USDEUR: 0.92, USDGBP: 0.79 } }, "GBP", "EUR")).toBe(1.164557);
    expect(parseRateResponse("currency_layer", { success: false, error: { info: "invalid key" } }, "GBP", "EUR")).toBeNull();
  });

  it("Open Exchange Rates: numeric rates against the reported base", () => {
    expect(parseRateResponse("open_exchange_rate", { base: "USD", rates: { JPY: 150, EUR: 0.9 } }, "JPY", "EUR")).toBe(0.006);
  });
});

describe("provider requests", () => {
  it("builds provider URLs and encodes the key", () => {
    expect(rateRequestUrl("currency_converter", "k&1", { planType: "FREE" }, "EUR", "USD")).toBe("https://free.currconv.com/api/v7/convert?q=EUR_USD&compact=ultra&apiKey=k%261");
    expect(rateRequestUrl("open_exchange_rate", "abc", {}, "EUR", "USD")).toBe("https://openexchangerates.org/api/latest.json?app_id=abc&symbols=EUR,USD");
  });

  it("accepts only public dedicated URLs", () => {
    expect(rateRequestUrl("currency_converter", "k", { planType: "DEDICATED", url: "https://rates.example.com/" }, "EUR", "USD")).toBe("https://rates.example.com/api/v7/convert?q=EUR_USD&compact=ultra&apiKey=k");
    expect(rateRequestUrl("currency_converter", "k", { planType: "DEDICATED", url: "http://169.254.169.254" }, "EUR", "USD")).toBeNull();
    expect(rateRequestUrl("currency_converter", "k", { planType: "DEDICATED", url: "http://localhost:9000" }, "EUR", "USD")).toBeNull();
  });

  it("flags currencies served by another active provider", () => {
    const others = [
      { id: 1, currencies: ["EUR", "GBP"], active: true },
      { id: 2, currencies: ["JPY"], active: false },
    ];
    expect(currencyConflicts(["EUR", "JPY"], others, null)).toEqual(["EUR"]);
    expect(currencyConflicts(["EUR"], others, 1)).toEqual([]);
  });
});
