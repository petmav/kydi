import { describe, expect, it } from "vitest";
import { validateSettingsPatch } from "@/server/company-settings";
import { bucketCashFlow } from "@/server/dashboard";

describe("company settings patch (API POST company/settings)", () => {
  it("normalises booleans and numbers to the stored string form", () => {
    const r = validateSettingsPatch({ invoice_due_date_days: 14, tax_per_item: true, invoice_use_time: "NO", retrospective_edits: "disable_on_invoice_paid" });
    expect(r).toEqual({ ok: true, values: { invoice_due_date_days: "14", tax_per_item: "YES", invoice_use_time: "NO", retrospective_edits: "disable_on_invoice_paid" } });
  });

  it("rejects unknown keys and invalid values instead of dropping them", () => {
    const r = validateSettingsPatch({ retrospective_edits: "never", made_up_key: "x", invoice_number_format: "{{SERIES:INV}}{{SEQUENCE:6}}" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["made_up_key", "retrospective_edits"]);
    }
  });
});

describe("cash-flow bucketing (dashboard and customer chart)", () => {
  it("buckets by day for short ranges and nets receipts against expenses", () => {
    // Appendix A.5: invoice 341.76, first payment 200.00; plus a 50.00 expense.
    const r = bucketCashFlow({ from: "2026-10-01", to: "2026-10-03" }, [
      { date: "2026-10-02", kind: "sales", amount: 34176 },
      { date: "2026-10-02", kind: "receipts", amount: 20000 },
      { date: "2026-10-03", kind: "expenses", amount: 5000 },
      { date: "2026-10-09", kind: "sales", amount: 999 },
    ]);
    expect(r.byDay).toBe(true);
    expect(r.rows.map((x) => x.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(r.rows[1]).toEqual({ key: "2026-10-02", sales: 34176, receipts: 20000, expenses: 0, net: 20000 });
    expect(r.totals).toEqual({ sales: 34176, receipts: 20000, expenses: 5000, net: 15000 });
  });

  it("buckets by calendar month for long ranges (Appendix A.8 base amounts)", () => {
    const r = bucketCashFlow({ from: "2026-01-01", to: "2026-12-31" }, [
      { date: "2026-11-01", kind: "sales", amount: 10800 },
      { date: "2026-11-20", kind: "receipts", amount: 11000 },
    ]);
    expect(r.byDay).toBe(false);
    expect(r.rows).toHaveLength(12);
    expect(r.rows[10]).toEqual({ key: "2026-11", sales: 10800, receipts: 11000, expenses: 0, net: 11000 });
  });
});
