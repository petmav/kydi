import { describe, expect, it } from "vitest";
import { computeDocument, type TaxSpec } from "./totals";
import { computeCreditNote, type CreditSource } from "./credit";
import { recomputeBalance, shouldMarkOverdue, estimateTransitions } from "./status";
import { renderNumber } from "./numbering";
import { nextOccurrence } from "./cron";
import { R, toBase } from "@/lib/money";
import { zonedToUtc } from "@/lib/dates";

/** Spec Appendix A worked examples, verbatim. */

const tax = (name: string, o: Partial<TaxSpec>): TaxSpec => ({ taxTypeId: null, name, calculationType: "PERCENTAGE", percent: null, fixedAmount: null, compound: false, ...o });
const line = (price: number, quantity: number, extra: Partial<{ discountType: "FIXED" | "PERCENTAGE"; discount: number; taxes: TaxSpec[] }> = {}) => ({
  price,
  quantity,
  discountType: "FIXED" as const,
  discount: 0,
  taxes: [],
  ...extra,
});
const doc = { discountPerItem: false, taxPerItem: false, taxIncluded: false, discountType: "FIXED" as const, discount: 0, taxes: [] as TaxSpec[], exchangeRate: 1 };

describe("Appendix A", () => {
  it("A.1 document-level discount and taxes, prices exclude tax", () => {
    const r = computeDocument({
      ...doc,
      discountType: "PERCENTAGE",
      discount: 10,
      taxes: [tax("VAT", { percent: 20 }), tax("Eco fee", { calculationType: "FIXED", fixedAmount: 150 }), tax("Local", { percent: 5, compound: true })],
      lines: [line(10000, 2), line(3333, 3)],
    });
    expect(r.subTotal).toBe(29999);
    expect(r.discountVal).toBe(3000);
    expect(r.taxes.map((t) => t.amount)).toEqual([5400, 150, 1627]);
    expect(r.tax).toBe(7177);
    expect(r.total).toBe(34176);
  });

  it("A.2 prices include tax", () => {
    const r = computeDocument({ ...doc, taxIncluded: true, taxes: [tax("VAT", { percent: 20 })], lines: [line(12000, 1)] });
    expect(r.tax).toBe(2000);
    expect(r.total).toBe(12000);
    const c = computeDocument({ ...doc, taxIncluded: true, taxes: [tax("VAT", { percent: 20 }), tax("C", { percent: 5, compound: true })], lines: [line(12000, 1)] });
    expect(c.total).toBe(12600);
  });

  it("A.3 per-line taxes with a document discount", () => {
    const vat = [tax("VAT", { percent: 10 })];
    const r = computeDocument({ ...doc, taxPerItem: true, discount: 3000, lines: [line(10000, 1, { taxes: vat }), line(5000, 1, { taxes: vat })] });
    expect(r.lines.map((l) => l.tax)).toEqual([799, 401]);
    expect(r.tax).toBe(1200);
    expect(r.total).toBe(13200);
  });

  it("A.4 per-line discounts", () => {
    const r = computeDocument({
      ...doc,
      discountPerItem: true,
      lines: [line(5000, 3, { discountType: "PERCENTAGE", discount: 10 }), line(15000, 1, { discountType: "FIXED", discount: 20000 })],
    });
    expect(r.lines[0]).toMatchObject({ discountVal: 1500, total: 13500 });
    expect(r.lines[1]).toMatchObject({ discountVal: 15000, total: 0 });
  });

  it("A.5 payments and statuses", () => {
    const base = { total: 34176, credited: 0, status: "SENT" as const, sent: true, viewed: false, overdue: false };
    expect(recomputeBalance({ ...base, paid: 20000 })).toMatchObject({ dueAmount: 14176, paidStatus: "PARTIALLY_PAID", status: "SENT" });
    const done = recomputeBalance({ ...base, paid: 34176 });
    expect(done).toMatchObject({ dueAmount: 0, paidStatus: "PAID", status: "COMPLETED" });
    expect(recomputeBalance({ ...base, status: "COMPLETED", paid: 20000 })).toMatchObject({ dueAmount: 14176, status: "SENT" });
    expect(recomputeBalance({ ...base, status: "COMPLETED", viewed: true, paid: 20000 }).status).toBe("VIEWED");
    expect(50000 - 34176).toBe(15824);
  });

  it("A.6 partial credit notes telescope exactly", () => {
    const src: CreditSource = {
      subTotal: 999,
      discountVal: 0,
      total: 1099,
      taxPerItem: false,
      discountPerItem: false,
      taxIncluded: false,
      taxes: [{ key: "vat", name: "VAT", amount: 100 }],
      lines: [{ id: 1, quantity: 3, price: 333, discountVal: 0, taxes: [] }],
      paid: 0,
      credited: 0,
    };
    const totals: number[] = [];
    let creditedQty = new Map<number, number>();
    let credited = 0;
    for (let i = 0; i < 3; i++) {
      const r = computeCreditNote({ ...src, credited }, creditedQty, new Map([[1, 1]]));
      if (!r.ok) throw new Error(r.error);
      totals.push(r.total);
      credited += r.total;
      creditedQty = new Map([[1, (creditedQty.get(1) ?? 0) + 1]]);
    }
    expect(totals).toEqual([366, 367, 366]);
    expect(credited).toBe(1099);
    expect(computeCreditNote({ ...src, credited }, creditedQty, new Map()).ok).toBe(false);
    const paid = computeCreditNote({ ...src, paid: 500 }, new Map(), new Map());
    expect(paid).toEqual({ ok: false, error: "credit_amount_exceeds_invoice_balance" });
  });

  it("A.7 numbering", () => {
    expect(renderNumber("{{SERIES:INV}}{{DELIMITER:-}}{{DATE_FORMAT:Y}}{{DELIMITER:-}}{{SEQUENCE:4}}", { sequence: 12, date: new Date(2026, 9, 16) })).toBe("INV-2026-0012");
    expect(renderNumber("{{CUSTOMER_SERIES}}{{DELIMITER:/}}{{CUSTOMER_SEQUENCE:3}}", { sequence: 1, customerSequence: 5, customerPrefix: "ACME" })).toBe("ACME/005");
    expect(renderNumber("{{CUSTOMER_SERIES}}{{DELIMITER:/}}{{CUSTOMER_SEQUENCE:3}}", { sequence: 1, customerSequence: 5, customerPrefix: null })).toBe("CST/005");
    expect(renderNumber("{{SERIES:CN}}{{DELIMITER:-}}{{SEQUENCE:6}}", { sequence: 1 })).toBe("CN-000001");
  });

  it("A.8 multi-currency", () => {
    expect(toBase(10000, 1.08)).toBe(10800);
    expect(R(5400 / 1.08)).toBe(5000);
    expect(toBase(10000, 1.1)).toBe(11000);
  });

  it("A.9 recurring schedule (Europe/Berlin)", () => {
    const tz = "Europe/Berlin";
    const start = zonedToUtc(2026, 10, 16, 0, 0, tz);
    const first = nextOccurrence("0 0 1 * *", start, tz)!;
    expect(first.getTime()).toBe(zonedToUtc(2026, 11, 1, 0, 0, tz).getTime());
    const bare = zonedToUtc(2026, 11, 1, 0, 0, tz);
    expect(nextOccurrence("0 0 1 * *", bare, tz)!.getTime()).toBe(zonedToUtc(2026, 12, 1, 0, 0, tz).getTime());
  });

  it("A.10 overdue & expiry", () => {
    const inv = { type: "INVOICE", status: "SENT" as const, overdue: false, dueDate: "2026-10-15" };
    expect(shouldMarkOverdue(inv, "2026-10-16")).toBe(true);
    expect(shouldMarkOverdue({ ...inv, dueDate: "2026-10-16" }, "2026-10-16")).toBe(false);
    expect(shouldMarkOverdue({ ...inv, status: "DRAFT" }, "2026-12-01")).toBe(false);
    expect(estimateTransitions.shouldExpire("SENT", "2026-10-15", "2026-10-16")).toBe(true);
    expect(estimateTransitions.shouldExpire("ACCEPTED", "2026-10-15", "2026-10-16")).toBe(false);
  });
});
