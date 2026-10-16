/** Status machines, spec §4.5–4.7. */

export type InvoiceStatus = "DRAFT" | "SENT" | "VIEWED" | "COMPLETED";
export type PaidStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type EstimateStatus = "DRAFT" | "SENT" | "VIEWED" | "EXPIRED" | "ACCEPTED" | "REJECTED";

export type BalanceInput = {
  total: number;
  paid: number; // sum of payment allocations
  credited: number; // sum of |credit note totals|
  status: InvoiceStatus;
  sent: boolean;
  viewed: boolean;
  overdue: boolean;
};

/** Recomputes due amount + statuses after any balance change (payments, credits, edits). */
export function recomputeBalance(inv: BalanceInput) {
  const dueAmount = Math.max(0, inv.total - inv.paid - inv.credited);
  let paidStatus: PaidStatus;
  if (dueAmount === 0) paidStatus = "PAID";
  else if (inv.paid === 0) paidStatus = "UNPAID";
  else paidStatus = "PARTIALLY_PAID";

  let status = inv.status;
  let overdue = inv.overdue;
  if (dueAmount === 0) {
    status = "COMPLETED";
    overdue = false;
  } else if (status === "COMPLETED") {
    status = inv.viewed ? "VIEWED" : inv.sent ? "SENT" : "DRAFT";
  }
  return { dueAmount, paidStatus, status, overdue };
}

/** Invoice delivery transitions. */
export const invoiceTransitions = {
  markSent: (s: InvoiceStatus) => s === "DRAFT",
  /** Sending an email moves DRAFT -> SENT, other statuses unchanged. */
  afterEmail: (s: InvoiceStatus): InvoiceStatus => (s === "DRAFT" ? "SENT" : s),
  /** Customer views the document. */
  afterView: (s: InvoiceStatus): InvoiceStatus => (s === "DRAFT" || s === "SENT" ? "VIEWED" : s),
};

export type RetroPolicy = "allow" | "disable_on_invoice_sent" | "disable_on_invoice_partial_paid" | "disable_on_invoice_paid";

/** Spec §4.6 allow_edit. */
export function invoiceAllowEdit(paidStatus: PaidStatus, hasCreditNotes: boolean, policy: string): boolean {
  if (hasCreditNotes) return false;
  switch (policy as RetroPolicy) {
    case "disable_on_invoice_sent":
    case "disable_on_invoice_partial_paid":
      return paidStatus === "UNPAID";
    case "disable_on_invoice_paid":
      return paidStatus !== "PAID";
    default:
      return true;
  }
}

/** Overdue sweep predicate (date-only compare; due today is not overdue). */
export function shouldMarkOverdue(
  inv: { type: string; status: InvoiceStatus; overdue: boolean; dueDate: string | null },
  today: string,
): boolean {
  return inv.type === "INVOICE" && inv.status !== "DRAFT" && inv.status !== "COMPLETED" && !inv.overdue && !!inv.dueDate && inv.dueDate < today;
}

export const estimateTransitions = {
  markSent: (s: EstimateStatus) => s !== "SENT",
  afterEmail: (s: EstimateStatus): EstimateStatus => (s === "DRAFT" ? "SENT" : s),
  afterView: (s: EstimateStatus): EstimateStatus => (s === "DRAFT" || s === "SENT" ? "VIEWED" : s),
  canDecide: (s: EstimateStatus) => s !== "ACCEPTED" && s !== "REJECTED",
  canCustomerDecide: (s: EstimateStatus) => s !== "ACCEPTED" && s !== "REJECTED" && s !== "EXPIRED",
  canConvert: (s: EstimateStatus) => s !== "REJECTED",
  shouldExpire: (s: EstimateStatus, expiryDate: string | null, today: string) =>
    !!expiryDate && expiryDate < today && s !== "ACCEPTED" && s !== "REJECTED" && s !== "EXPIRED",
};

/** Template name mapping between documents: estimate2 <-> invoice2. */
export function mapTemplate(name: string, to: "invoice" | "estimate"): string {
  const n = name.match(/(\d+)$/)?.[1];
  return n && ["1", "2", "3"].includes(n) ? `${to}${n}` : `${to}1`;
}
