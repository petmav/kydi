import { describe, expect, it } from "vitest";
import { billDue, billVoidError, computeBill, isDailyOrSlower, payablesSplit, sourceRemaining, validateSettlements } from "./purchasing";
import type { TaxSpec } from "./totals";

const vat20: TaxSpec = { taxTypeId: 1, name: "VAT", calculationType: "PERCENTAGE", percent: 20, fixedAmount: null, compound: false };
const levy: TaxSpec = { taxTypeId: 2, name: "Levy", calculationType: "FIXED", percent: null, fixedAmount: 150, compound: false };

describe("computeBill (§4.1 with per-line discount and tax)", () => {
  it("prices exclude tax", () => {
    // Line 1: 3 x 12.50 = 37.50, 10% discount = 3.75 -> 33.75; VAT 20% = 6.75
    // Line 2: 1 x 100.00, fixed discount 5.00 -> 95.00; VAT 20% = 19.00, levy 1.50
    const r = computeBill(
      [
        { expenseCategoryId: 1, description: "Paper", quantity: 3, price: 1250, discountType: "PERCENTAGE", discount: 10, taxes: [vat20] },
        { expenseCategoryId: 1, description: "Toner", quantity: 1, price: 10000, discountType: "FIXED", discount: 500, taxes: [vat20, levy] },
      ],
      false,
      1,
    );
    expect(r.lines[0]).toMatchObject({ subTotal: 3750, discountVal: 375, total: 3375, tax: 675 });
    expect(r.lines[1]).toMatchObject({ subTotal: 10000, discountVal: 500, total: 9500, tax: 2050 });
    expect(r.subTotal).toBe(12875);
    expect(r.tax).toBe(2725);
    expect(r.total).toBe(15600); // 128.75 + 27.25
    expect(r.baseTotal).toBe(15600);
  });

  it("prices include tax: simple tax backed out, total unchanged", () => {
    // 120.00 incl. 20% VAT -> tax = 120 - 120/1.2 = 20.00; total stays 120.00
    const r = computeBill([{ expenseCategoryId: 1, description: "Service", quantity: 1, price: 12000, discountType: "PERCENTAGE", discount: 0, taxes: [vat20] }], true, 1);
    expect(r.tax).toBe(2000);
    expect(r.total).toBe(12000);
  });

  it("converts to base currency with the exchange rate", () => {
    // 50.00 at 1.25 -> base 62.50
    const r = computeBill([{ expenseCategoryId: 1, description: "Import", quantity: 2, price: 2500, discountType: "PERCENTAGE", discount: 0, taxes: [] }], false, 1.25);
    expect(r.total).toBe(5000);
    expect(r.baseTotal).toBe(6250);
  });
});

describe("settlement rules", () => {
  it("bill due and source remaining never go negative", () => {
    expect(billDue(15600, 10000)).toBe(5600);
    expect(billDue(15600, 20000)).toBe(0);
    expect(sourceRemaining(10000, 6000, 1000)).toBe(3000);
    expect(sourceRemaining(10000, 6000, 5000)).toBe(0);
  });

  it("validates allocations against bill balances and the source amount", () => {
    expect(validateSettlements(10000, [{ billId: 1, amount: 6000, available: 15600 }, { billId: 2, amount: 4000, available: 4000 }])).toEqual({});
    expect(validateSettlements(10000, [{ billId: 1, amount: 6000, available: 5000 }])[1]).toMatch(/exceeds the bill/);
    expect(validateSettlements(5000, [{ billId: 1, amount: 3000, available: 9000 }, { billId: 2, amount: 3000, available: 9000 }])[0]).toMatch(/exceeds the available/);
    expect(validateSettlements(5000, [{ billId: 1, amount: 0, available: 9000 }])[1]).toMatch(/at least/);
    expect(validateSettlements(9000, [{ billId: 1, amount: 100, available: 9000 }, { billId: 1, amount: 100, available: 9000 }])[1]).toMatch(/only once/);
  });

  it("refuses to void allocated or credited bills and requires a reason", () => {
    expect(billVoidError({ status: "OPEN", settlements: 0, activeCredits: 0 }, "Duplicate")).toBeNull();
    expect(billVoidError({ status: "OPEN", settlements: 0, activeCredits: 0 }, " ")).toMatch(/reason/);
    expect(billVoidError({ status: "OPEN", settlements: 1, activeCredits: 0 }, "x")).toMatch(/allocated/);
    expect(billVoidError({ status: "OPEN", settlements: 0, activeCredits: 2 }, "x")).toMatch(/credits/);
    expect(billVoidError({ status: "VOID", settlements: 0, activeCredits: 0 }, "x")).toMatch(/already/);
  });
});

describe("payables split", () => {
  it("buckets open bills by due date", () => {
    const r = payablesSplit(
      [
        { dueDate: "2026-10-01", baseDue: 1000 },
        { dueDate: "2026-10-17", baseDue: 2000 },
        { dueDate: "2026-11-16", baseDue: 3000 },
        { dueDate: "2026-11-17", baseDue: 4000 },
        { dueDate: null, baseDue: 500 },
        { dueDate: "2026-09-01", baseDue: 0 },
      ],
      "2026-10-17",
      "2026-11-16",
    );
    expect(r.total).toBe(10500);
    expect(r.count).toBe(5);
    expect(r.overdue).toEqual({ amount: 1000, count: 1 });
    expect(r.dueSoon).toEqual({ amount: 5000, count: 2 });
    expect(r.later).toEqual({ amount: 4500, count: 2 });
  });
});

describe("recurring cost frequencies", () => {
  it("allows daily or slower schedules only", () => {
    expect(isDailyOrSlower("0 0 * * *")).toBe(true);
    expect(isDailyOrSlower("0 0 1 * *")).toBe(true);
    expect(isDailyOrSlower("0 * * * *")).toBe(false);
    expect(isDailyOrSlower("* * * * *")).toBe(false);
    expect(isDailyOrSlower("*/5 3 * * *")).toBe(false);
    expect(isDailyOrSlower("not a cron")).toBe(false);
  });
});
