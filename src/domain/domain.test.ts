import { describe, expect, it } from "vitest";
import { parseNumberFormat, renderNumber, validateNumberFormat } from "./numbering";
import { estimateTransitions, invoiceAllowEdit, mapTemplate, recomputeBalance, shouldMarkOverdue } from "./status";
import { allocationBaseAmounts, validateAllocations } from "./allocation";
import { isValidCron, nextOccurrence, upcomingOccurrences } from "./cron";
import { fiscalYearRange, todayIn } from "@/lib/dates";

describe("numbering (§3.21)", () => {
  it("renders the default invoice format", () => {
    expect(renderNumber("{{SERIES:INV}}{{DELIMITER:-}}{{SEQUENCE:6}}", { sequence: 42 })).toBe("INV-000042");
  });
  it("renders customer tokens and dates", () => {
    const out = renderNumber("{{CUSTOMER_SERIES}}{{DELIMITER:/}}{{DATE_FORMAT:Y}}{{DELIMITER:/}}{{CUSTOMER_SEQUENCE:3}}", {
      sequence: 1,
      customerSequence: 7,
      customerPrefix: "",
      date: new Date(2026, 4, 3),
    });
    expect(out).toBe("CST/2026/007");
  });
  it("validates formats", () => {
    expect(validateNumberFormat("{{SERIES:INV}}")).toMatch(/SEQUENCE/);
    expect(validateNumberFormat("{{FOO}}{{SEQUENCE}}")).toMatch(/Unknown/);
    expect(validateNumberFormat("{{SERIES:INV}}{{SEQUENCE:4}}")).toBeNull();
    expect(parseNumberFormat("x{{SEQUENCE:4}}y")).toEqual([{ name: "SEQUENCE", value: "4" }]);
  });
});

describe("invoice balance & status (§4.5)", () => {
  const inv = { total: 10000, paid: 0, credited: 0, status: "SENT" as const, sent: true, viewed: false, overdue: true };
  it("partially paid", () => {
    expect(recomputeBalance({ ...inv, paid: 4000 })).toMatchObject({ dueAmount: 6000, paidStatus: "PARTIALLY_PAID", status: "SENT" });
  });
  it("fully paid completes and clears overdue", () => {
    expect(recomputeBalance({ ...inv, paid: 10000 })).toMatchObject({ dueAmount: 0, paidStatus: "PAID", status: "COMPLETED", overdue: false });
  });
  it("reverts to the furthest delivery step when balance rises again", () => {
    expect(recomputeBalance({ ...inv, status: "COMPLETED", viewed: true }).status).toBe("VIEWED");
    expect(recomputeBalance({ ...inv, status: "COMPLETED", sent: false }).status).toBe("DRAFT");
  });
  it("credits reduce the balance without counting as paid", () => {
    expect(recomputeBalance({ ...inv, credited: 2500 })).toMatchObject({ dueAmount: 7500, paidStatus: "UNPAID" });
  });
  it("edit lock policies (§4.6)", () => {
    expect(invoiceAllowEdit("PAID", false, "allow")).toBe(true);
    expect(invoiceAllowEdit("PARTIALLY_PAID", false, "disable_on_invoice_partial_paid")).toBe(false);
    expect(invoiceAllowEdit("PARTIALLY_PAID", false, "disable_on_invoice_paid")).toBe(true);
    expect(invoiceAllowEdit("UNPAID", true, "allow")).toBe(false);
  });
  it("overdue sweep predicate", () => {
    const base = { type: "INVOICE", status: "SENT" as const, overdue: false, dueDate: "2026-01-10" };
    expect(shouldMarkOverdue(base, "2026-01-11")).toBe(true);
    expect(shouldMarkOverdue(base, "2026-01-10")).toBe(false);
    expect(shouldMarkOverdue({ ...base, status: "DRAFT" }, "2026-02-01")).toBe(false);
  });
});

describe("estimate transitions (§4.7)", () => {
  it("guards decisions and expiry", () => {
    expect(estimateTransitions.canDecide("ACCEPTED")).toBe(false);
    expect(estimateTransitions.canCustomerDecide("EXPIRED")).toBe(false);
    expect(estimateTransitions.shouldExpire("DRAFT", "2026-01-01", "2026-01-02")).toBe(true);
    expect(estimateTransitions.shouldExpire("ACCEPTED", "2026-01-01", "2026-01-02")).toBe(false);
    expect(mapTemplate("estimate2", "invoice")).toBe("invoice2");
    expect(mapTemplate("custom", "estimate")).toBe("estimate1");
  });
});

describe("payment allocations (§4.10)", () => {
  it("floors shares and gives the remainder to the last row when fully allocated", () => {
    expect(allocationBaseAmounts(1000, 1501, [333, 667])).toEqual([499, 1002]);
    expect(allocationBaseAmounts(1000, 1501, [333])).toEqual([499]);
  });
  it("rejects over-allocation", () => {
    const errs = validateAllocations(1000, [
      { invoiceId: 1, amount: 800, available: 500 },
      { invoiceId: 2, amount: 300, available: 300 },
    ]);
    expect(errs[1]).toMatch(/exceeds/);
    expect(errs[0]).toMatch(/payment amount/);
  });
});

describe("cron recurrence (§4.9)", () => {
  it("monthly schedule starting on the 1st first runs next month", () => {
    const start = new Date("2026-03-01T00:00:00Z");
    expect(nextOccurrence("0 0 1 * *", start, "UTC")?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
  it("evaluates in the company time zone", () => {
    const next = nextOccurrence("0 0 * * *", new Date("2026-06-10T12:00:00Z"), "America/New_York");
    expect(next?.toISOString()).toBe("2026-06-11T04:00:00.000Z");
  });
  it("lists upcoming weekly runs on Sundays", () => {
    const runs = upcomingOccurrences("0 0 * * 0", new Date("2026-10-16T10:00:00Z"), "UTC", 3);
    expect(runs.map((d) => d.getUTCDay())).toEqual([0, 0, 0]);
  });
  it("validates expressions", () => {
    expect(isValidCron("*/15 9-17 * * 1-5")).toBe(true);
    expect(isValidCron("61 * * * *")).toBe(false);
    expect(isValidCron("* * *")).toBe(false);
  });
});

describe("dates", () => {
  it("computes today in a zone and fiscal ranges", () => {
    expect(todayIn("Pacific/Kiritimati", new Date("2026-01-01T11:00:00Z"))).toBe("2026-01-02");
    expect(fiscalYearRange("4-3", "2026-02-10")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(fiscalYearRange("1-12", "2026-02-10")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});
