import type { Metadata } from "next";
import { ShoppingCart } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Suppliers & bills" };

/** Purchasing (suppliers, bills, supplier payments/credits/refunds, recurring costs) is Phase 2 per spec §11. */
export default function PurchasesPage() {
  return (
    <>
      <PageHeader title="Suppliers & bills" actions={<Badge tone="amber">Planned for a later release</Badge>} />
      <Card>
        <EmptyState
          icon={<ShoppingCart className="h-6 w-6" aria-hidden="true" />}
          title="Purchasing is not available in this version"
          description="Suppliers, bills, supplier payments, credits, refunds and recurring costs are scheduled for a later release. Record what you spend as expenses in the meantime."
          action={<ButtonLink href="/expenses">Go to expenses</ButtonLink>}
        />
      </Card>
    </>
  );
}
