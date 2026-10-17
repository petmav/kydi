import type { Metadata } from "next";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { ActionButton } from "@/components/confirm";
import { PaymentGatewayForm } from "@/components/settings/payment-gateway-form";
import { getCompanyContext } from "@/lib/auth/context";
import { getBaseUrl } from "@/lib/url";
import { GATEWAY_LABELS, getGatewayView } from "@/server/online-payments";
import { saveGatewayAction, testGatewayAction } from "./actions";

export const metadata: Metadata = { title: "Online payments" };

export default async function OnlinePaymentsPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can manage online payments." />;
  const view = await getGatewayView(ctx.companyId);
  const webhookUrl = `${await getBaseUrl()}/api/payments/stripe/${ctx.companyId}`;
  return (
    <Card>
      <CardHeader
        title="Online payments"
        description="Customers can pay an invoice's outstanding balance from the customer portal. Payments are recorded and allocated automatically."
        actions={<ActionButton action={testGatewayAction}>Test connection</ActionButton>}
      />
      <CardBody className="space-y-4">
        {view.enabled && view.driver === "demo" && !view.demoAllowed ? (
          <Alert tone="error" title="The demo gateway is disabled on this install">
            Production installs never accept demo payments, so customers currently cannot pay online. Switch to Stripe Checkout.
          </Alert>
        ) : view.enabled ? (
          <Alert tone="success" title={`Online payments are on (${GATEWAY_LABELS[view.driver]}${view.mode ? `, ${view.mode} mode` : ""})`}>
            Unpaid invoices show a Pay button in the customer portal.{view.mode === "test" ? " Test-mode keys only accept Stripe test cards; switch to live keys to take real payments." : ""}
          </Alert>
        ) : (
          <Alert tone="info" title="Online payments are off">Customers can view invoices in the portal but not pay them.</Alert>
        )}
        <PaymentGatewayForm action={saveGatewayAction} view={view} labels={GATEWAY_LABELS} webhookUrl={webhookUrl} />
      </CardBody>
    </Card>
  );
}
