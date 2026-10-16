import { Badge, type BadgeTone } from "@/components/ui/primitives";

/** Appendix C status display mapping. Text labels, muted tones. */
const MAP: Record<string, [string, BadgeTone]> = {
  "inv:DRAFT": ["Draft", "gray"],
  "inv:SENT": ["Sent", "blue"],
  "inv:VIEWED": ["Viewed", "blue"],
  "inv:COMPLETED": ["Completed", "green"],
  "paid:UNPAID": ["Unpaid", "amber"],
  "paid:PARTIALLY_PAID": ["Partially paid", "amber"],
  "paid:PAID": ["Paid", "green"],
  "est:DRAFT": ["Draft", "gray"],
  "est:SENT": ["Sent", "blue"],
  "est:VIEWED": ["Viewed", "blue"],
  "est:ACCEPTED": ["Accepted", "green"],
  "est:REJECTED": ["Rejected", "red"],
  "est:EXPIRED": ["Expired", "gray"],
  "rec:ACTIVE": ["Active", "green"],
  "rec:ON_HOLD": ["On hold", "amber"],
  "rec:COMPLETED": ["Completed", "gray"],
};

export function StatusBadge({ kind, value }: { kind: "inv" | "paid" | "est" | "rec"; value: string }) {
  const [label, tone] = MAP[`${kind}:${value}`] ?? [value, "gray"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PaidBadge({ paidStatus, overdue }: { paidStatus: string; overdue: boolean }) {
  return overdue && paidStatus !== "PAID" ? <Badge tone="red">Overdue</Badge> : <StatusBadge kind="paid" value={paidStatus} />;
}

export function CreditedBadge({ credited, total }: { credited: number; total: number }) {
  if (credited <= 0) return null;
  return credited >= total ? <Badge tone="red">Cancelled</Badge> : <Badge tone="amber">Partially credited</Badge>;
}
