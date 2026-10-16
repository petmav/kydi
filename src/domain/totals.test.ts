import { describe, expect, it } from "vitest";
import { calculateTaxes, computeDocument, taxSummary, type TaxSpec } from "./totals";
import { R, Rh, toMinor } from "@/lib/money";

const pct = (name: string, percent: number, compound = false): TaxSpec => ({
  taxTypeId: null,
  name,
  calculationType: "PERCENTAGE",
  percent,
  fixedAmount: null,
  compound,
});
const fixed = (name: string, amount: number, compound = false): TaxSpec => ({
  taxTypeId: null,
  name,
  calculationType: "FIXED",
  percent: null,
  fixedAmount: amount,
  compound,
});

const base = { discountPerItem: false, taxPerItem: false, taxIncluded: false, discountType: "FIXED" as const, discount: 0, taxes: [], exchangeRate: 1 };

describe("rounding", () => {
  it("R rounds half up toward +infinity", () => {
    expect(R(2.5)).toBe(3);
    expect(R(-2.5)).toBe(-2);
    expect(R(2.4999)).toBe(2);
    expect(R(1.15 * 100 * 0.5 * 2 - 0.5)).toBe(115); // float noise is cleaned before rounding
  });
  it("Rh rounds half away from zero", () => {
    expect(Rh(-2.5)).toBe(-3);
    expect(Rh(2.5)).toBe(3);
  });
  it("parses major amounts to minor units", () => {
    expect(toMinor("1,234.56")).toBe(123456);
    expect(toMinor("0.1")).toBe(10);
    expect(Number.isNaN(toMinor("abc"))).toBe(true);
  });
});

describe("tax calculation (§4.2)", () => {
  it("charges simple then compound taxes on the base", () => {
    const rows = calculateTaxes(10000, [pct("GST", 10), pct("Compound", 5, true)], false);
    expect(rows.map((r) => r.amount)).toEqual([1000, 550]);
  });
  it("backs simple taxes out of tax-inclusive prices and adds compound on top", () => {
    const rows = calculateTaxes(11000, [pct("VAT", 10), pct("C", 5, true)], true);
    expect(rows[0].amount).toBe(1000);
    expect(rows[1].amount).toBe(550);
  });
  it("charges fixed taxes once regardless of quantity", () => {
    expect(calculateTaxes(99999, [fixed("Eco fee", 250)], false)[0].amount).toBe(250);
  });
});

describe("document totals (§4.1)", () => {
  it("sums lines, applies a percentage document discount and document tax", () => {
    const r = computeDocument({
      ...base,
      discountType: "PERCENTAGE",
      discount: 10,
      taxes: [pct("VAT", 20)],
      lines: [
        { price: 5000, quantity: 2, discountType: "FIXED", discount: 0, taxes: [] },
        { price: 2550, quantity: 1.5, discountType: "FIXED", discount: 0, taxes: [] },
      ],
    });
    expect(r.subTotal).toBe(10000 + 3825);
    expect(r.discountVal).toBe(1383); // R(1382.5)
    expect(r.tax).toBe(R((13825 - 1383) * 0.2));
    expect(r.total).toBe(13825 - 1383 + r.tax);
  });

  it("caps fixed line discounts at the line subtotal", () => {
    const r = computeDocument({
      ...base,
      discountPerItem: true,
      lines: [{ price: 1000, quantity: 1, discountType: "FIXED", discount: 5000, taxes: [] }],
    });
    expect(r.lines[0].discountVal).toBe(1000);
    expect(r.total).toBe(0);
  });

  it("spreads a document discount over per-item tax bases", () => {
    const r = computeDocument({
      ...base,
      taxPerItem: true,
      discountType: "FIXED",
      discount: 1000,
      lines: [
        { price: 6000, quantity: 1, discountType: "FIXED", discount: 0, taxes: [pct("VAT", 10)] },
        { price: 4000, quantity: 1, discountType: "FIXED", discount: 0, taxes: [pct("VAT", 10)] },
      ],
    });
    // p = 0.6 / 0.4 -> bases 5400 / 3600
    expect(r.lines[0].tax).toBe(540);
    expect(r.lines[1].tax).toBe(360);
    expect(r.total).toBe(10000 - 1000 + 900);
    expect(taxSummary(r, true)).toEqual([{ name: "VAT", percent: 10, calculationType: "PERCENTAGE", amount: 900 }]);
  });

  it("excludes simple taxes from the total when prices include tax", () => {
    const r = computeDocument({ ...base, taxIncluded: true, taxes: [pct("VAT", 10)], lines: [{ price: 11000, quantity: 1, discountType: "FIXED", discount: 0, taxes: [] }] });
    expect(r.tax).toBe(1000);
    expect(r.total).toBe(11000);
  });

  it("computes base-currency twins with the exchange rate", () => {
    const r = computeDocument({ ...base, exchangeRate: 1.5, lines: [{ price: 1001, quantity: 1, discountType: "FIXED", discount: 0, taxes: [] }] });
    expect(r.baseTotal).toBe(1502); // R(1501.5)
  });
});
