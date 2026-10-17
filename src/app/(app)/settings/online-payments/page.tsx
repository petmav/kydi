import type { Metadata } from "next";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { ActionButton, ConfirmButton } from "@/components/confirm";
import { PaymentGatewayForm } from "@/components/settings/payment-gateway-form";
import { getCompanyContext } from "@/lib/auth/context";
import { webhookUrlProblem } from "@/lib/stripe";
import { GATEWAY_LABELS, getGatewayView, stripeWebhookUrl } from "@/server/online-payments";
import { disconnectGatewayAction, saveGatewayAction, testGatewayAction } from "./actions";

export const metadata: Metadata = { title: "Online payments" };

export default async function OnlinePaymentsPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can manage online payments." />;
  const view = await getGatewayView(ctx.companyId);
  const webhookUrl = await stripeWebhookUrl(ctx.companyId);
  const unreachable = webhookUrlProblem(webhookUrl);
  const stripeConnected = view.driver === "stripe" && view.secretsSet.includes("secretKey");
  return (
    <Card>
      <CardHeader
        title="Online payments"
        description="Customers can pay an invoice's outstanding balance from the customer portal. Payments are recorded and allocated automatically."
        actions={
          <>
            <ActionButton action={testGatewayAction}>Test connection</ActionButton>
            {stripeConnected ? (
              <ConfirmButton
                action={disconnectGatewayAction}
                title="Disconnect Stripe?"
                description="Kydi forgets your key and removes the webhook it registered in your Stripe account. Customers can no longer pay online until you connect again. Past payments stay recorded."
                confirmLabel="Disconnect"
              >
                Disconnect Stripe
              </ConfirmButton>
            ) : null}
          </>
        }
      />
      <CardBody className="space-y-4">
        {view.enabled && view.driver === "demo" && !view.demoAllowed ? (
          <Alert tone="error" title="The demo gateway is disabled on this install">
            Production installs never accept demo payments, so customers currently cannot pay online. Switch to Stripe Checkout.
          </Alert>
        ) : view.enabled ? (
          <Alert tone="success" title={`Online payments are on (${GATEWAY_LABELS[view.driver]}${view.mode ? `, ${view.mode} mode` : ""})`}>
            Unpaid invoices show a Pay button in the customer portal.
            {view.webhook === "auto" ? " Kydi registered its webhook in your Stripe account." : view.webhook === "manual" ? " Using the webhook signing secret you entered." : ""}
            {view.mode === "test" ? " Test-mode keys only accept Stripe test cards; paste a live key to take real payments." : ""}
          </Alert>
        ) : (
          <Alert tone="info" title="Online payments are off">Customers can view invoices in the portal but not pay them.</Alert>
        )}
        {unreachable && !stripeConnected ? (
          <Alert tone="warning" title="Stripe cannot reach this address yet">
            {unreachable} On a published install set <code>APP_URL</code> to its public https address. For local testing, use the Advanced option below with <code>stripe listen</code>.
          </Alert>
        ) : null}
        <PaymentGatewayForm action={saveGatewayAction} view={view} labels={GATEWAY_LABELS} webhookUrl={webhookUrl} />
      </CardBody>
    </Card>
  );
}
