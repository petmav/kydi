import Link from "next/link";
import { cn } from "@/lib/utils";

/** "One-time | Recurring" view switcher on the invoices screens (spec §5.4). */
export function DocSwitch({ current }: { current: "one-time" | "recurring" }) {
  const item = (key: "one-time" | "recurring", href: string, label: string) => (
    <Link
      href={href}
      aria-current={current === key ? "page" : undefined}
      className={cn("px-3 py-1.5 text-sm focus-ring", current === key ? "bg-brand-700 text-white" : "bg-white text-ink-2 hover:bg-subtle")}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="Invoice type">
      {item("one-time", "/invoices", "One-time")}
      {item("recurring", "/recurring-invoices", "Recurring")}
    </div>
  );
}
