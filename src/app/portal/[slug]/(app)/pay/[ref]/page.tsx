import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { ActionButton } from "@/components/confirm";
import { requirePortalCustomer } from "@/lib/auth/portal";
import { db } from "@/lib/db";
import { getCompanySettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { activeGateway } from "@/server/online-payments";
import { portalDemoPayAction } from "../../../actions";

/** Demo gateway checkout: simulates a card payment so previews can show the flow without real money. */
export default async function DemoCheckout({ params }: { params: Promise<{ slug: string; ref: string }> }) {
  const { slug, ref } = await params;
  const { customer, company } = await requirePortalCustomer(slug);
  const op = await db.onlinePayment.findUnique({ where: { providerRef: ref }, include: { invoice: true } });
  if (!op || op.customerId !== customer.id || op.driver !== "demo") notFound();
  const g = await activeGateway(company.id);
  const s = await getCompanySettings(company.id);
  const back = `/portal/${slug}/invoices/${op.invoiceId}`;
  return (
    <>
      <PageHeader title="Pay invoice" back={<Link href={back} className="text-brand-700 hover:underline focus-ring rounded">← Back to invoice</Link>} />
      <Card className="mx-auto max-w-lg">
        <CardHeader title={`Invoice ${op.invoice.invoiceNumber}`} description={company.name} />
        <CardBody className="space-y-4">
          <Alert tone="warning" title="Demo payment">No money is charged. This simulates a successful card payment.</Alert>
          <DescriptionList
            items={[
              { label: "Amount", value: <span className="tabular font-semibold">{formatMoney(op.amount, op.currency, s.locale)}</span> },
              { label: "Card", value: <span className="tabular">4242 4242 4242 4242 · 12/34 · 123</span> },
            ]}
          />
          {op.status === "PAID" ? (
            <Alert tone="success" title="Already paid">This payment has been recorded.</Alert>
          ) : op.status !== "PENDING" || !g || g.driver !== "demo" ? (
            <Alert tone="error" title="Unavailable">This payment link is no longer valid. Go back to the invoice to start again.</Alert>
          ) : (
            <div className="flex justify-end gap-2">
              <Link href={back} className={buttonClass("secondary")}>Cancel</Link>
              <ActionButton action={portalDemoPayAction.bind(null, slug, ref)} variant="primary">Pay {formatMoney(op.amount, op.currency, s.locale)}</ActionButton>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
