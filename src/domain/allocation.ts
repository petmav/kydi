/** Payment allocation rules, spec §4.10 / §4.3. */

/**
 * Base-currency share of each allocation: floor of the proportional share; when the payment is fully
 * allocated the last row absorbs the remainder so the shares sum to the payment's base amount.
 */
export function allocationBaseAmounts(paymentAmount: number, paymentBase: number, amounts: number[]): number[] {
  if (paymentAmount <= 0) return amounts.map(() => 0);
  const shares = amounts.map((a) => Math.floor((paymentBase * a) / paymentAmount));
  const allocated = amounts.reduce((s, a) => s + a, 0);
  if (allocated === paymentAmount && shares.length > 0) {
    const others = shares.slice(0, -1).reduce((s, x) => s + x, 0);
    shares[shares.length - 1] = paymentBase - others;
  }
  return shares;
}

export type AllocationCheck = {
  invoiceId: number;
  amount: number;
  /** total - credited - allocations from other payments */
  available: number;
};

/** Returns an error message per invoice id, or a general error under key 0. */
export function validateAllocations(paymentAmount: number, rows: AllocationCheck[]): Record<number, string> {
  const errors: Record<number, string> = {};
  const seen = new Set<number>();
  let sum = 0;
  for (const r of rows) {
    if (seen.has(r.invoiceId)) errors[r.invoiceId] = "Each invoice can be allocated only once per payment.";
    seen.add(r.invoiceId);
    if (!Number.isInteger(r.amount) || r.amount < 1) errors[r.invoiceId] = "Allocation must be at least 0.01.";
    else if (r.amount > r.available) errors[r.invoiceId] = "Allocation exceeds the invoice's outstanding balance.";
    sum += r.amount;
  }
  if (sum > paymentAmount) errors[0] = "Allocated total exceeds the payment amount.";
  return errors;
}
