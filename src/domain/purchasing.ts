import { computeDocument, type DiscountKind, type TaxRow, type TaxSpec } from "./totals";
import { FREQUENCY_PRESETS, isValidCron } from "./cron";

/** Purchasing rules (spec §3.20, §4.14). Pure functions; money in integer minor units. */

export type BillLineInput = {
  expenseCategoryId: number;
  description: string;
  quantity: number;
  price: number;
  discountType: DiscountKind;
  /** percent, or fixed minor units */
  discount: number;
  taxes: TaxSpec[];
};

export type BillLineResult = { subTotal: number; discountVal: number; tax: number; total: number; baseTotal: number; taxes: TaxRow[] };
export type BillResult = { lines: BillLineResult[]; subTotal: number; tax: number; total: number; baseTotal: number };

/**
 * Bill / supplier credit totals: §4.1 with per-line discount and per-line purchase taxes always on.
 * Line `total` is pre-tax (subtotal − discount); document total = Σ line totals + taxes per §4.1 step 9.
 */
export function computeBill(lines: BillLineInput[], taxIncluded: boolean, exchangeRate: number): BillResult {
  const r = computeDocument({
    lines: lines.map((l) => ({ price: l.price, quantity: l.quantity, discountType: l.discountType, discount: l.discount, taxes: l.taxes })),
    discountPerItem: true,
    taxPerItem: true,
    taxIncluded,
    discountType: "FIXED",
    discount: 0,
    taxes: [],
    exchangeRate,
  });
  return {
    lines: r.lines.map((l) => ({ subTotal: l.subtotal, discountVal: l.discountVal, tax: l.tax, total: l.total, baseTotal: l.baseTotal, taxes: l.taxes })),
    subTotal: r.subTotal,
    tax: r.tax,
    total: r.total,
    baseTotal: r.baseTotal,
  };
}

/** Bill due = total − Σ payment allocations − Σ credit allocations, never negative. */
export function billDue(total: number, settled: number): number {
  return Math.max(0, total - settled);
}

/** Unused part of a supplier payment or credit: amount − allocations − non-void refunds, never negative. */
export function sourceRemaining(amount: number, allocated: number, refunded: number): number {
  return Math.max(0, amount - allocated - refunded);
}

export type SettlementRow = {
  billId: number;
  amount: number;
  /** Bill due excluding this source's current allocation to it. */
  available: number;
};

/** Validates allocations of one payment/credit; errors keyed by bill id, general error under 0. */
export function validateSettlements(sourceAmount: number, rows: SettlementRow[]): Record<number, string> {
  const errors: Record<number, string> = {};
  const seen = new Set<number>();
  let sum = 0;
  for (const r of rows) {
    if (seen.has(r.billId)) errors[r.billId] = "Each bill can be allocated only once.";
    seen.add(r.billId);
    if (!Number.isInteger(r.amount) || r.amount < 1) errors[r.billId] = "Allocation must be at least 0.01.";
    else if (r.amount > r.available) errors[r.billId] = "Allocation exceeds the bill's outstanding balance.";
    sum += r.amount;
  }
  if (sum > sourceAmount) errors[0] = "Allocated total exceeds the available amount.";
  return errors;
}

/** Bill void rule (§4.14): refused while any allocation or non-void credit references it. */
export function billVoidError(state: { status: string; settlements: number; activeCredits: number }, reason: string): string | null {
  if (state.status === "VOID") return "This bill is already void.";
  if (!reason.trim()) return "Enter a reason for voiding.";
  if (state.settlements > 0) return "Remove the payments and credits allocated to this bill before voiding it.";
  if (state.activeCredits > 0) return "Void the supplier credits raised against this bill first.";
  return null;
}

export type PayableBill = { dueDate: string | null; baseDue: number };

/** Payables split for the dashboard card and supplier overview (§5.1 widget 2, same buckets as receivables). */
export function payablesSplit(bills: PayableBill[], today: string, soon: string) {
  const out = { total: 0, count: 0, overdue: { amount: 0, count: 0 }, dueSoon: { amount: 0, count: 0 }, later: { amount: 0, count: 0 } };
  for (const b of bills) {
    if (b.baseDue <= 0) continue;
    out.total += b.baseDue;
    out.count += 1;
    const bucket = b.dueDate && b.dueDate < today ? out.overdue : b.dueDate && b.dueDate <= soon ? out.dueSoon : out.later;
    bucket.amount += b.baseDue;
    bucket.count += 1;
  }
  return out;
}

/** Recurring costs run at most once per day: fixed minute and hour fields (§3.20 "daily-or-slower presets"). */
export function isDailyOrSlower(expr: string): boolean {
  if (!isValidCron(expr)) return false;
  const [minute, hour] = expr.trim().split(/\s+/);
  return /^\d{1,2}$/.test(minute) && /^\d{1,2}$/.test(hour);
}

export const RECURRING_COST_PRESETS = FREQUENCY_PRESETS.filter((p) => isDailyOrSlower(p.value));

/** Fields that stay editable once a bill is financially locked (§4.14). */
export const LOCKED_BILL_EDITABLE = ["reference", "dueDate", "notes"] as const;
