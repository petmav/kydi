import type { Metadata } from "next";
import { ArrowLeftRight } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { getCompanyContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Exchange rate provider" };

export default async function ExchangeRatesPage() {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-exchange-rate-provider")) return <Forbidden />;
  return (
    <Card>
      <CardHeader title="Exchange rate provider" actions={<Badge tone="amber">Not in v1</Badge>} />
      <EmptyState
        icon={<ArrowLeftRight className="h-6 w-6" aria-hidden="true" />}
        title="Live exchange-rate providers are not available yet"
        description="Kydi v1 does not call external rate APIs. Enter the rate on foreign-currency documents; the last rate you used for each currency is suggested automatically next time."
      />
    </Card>
  );
}
