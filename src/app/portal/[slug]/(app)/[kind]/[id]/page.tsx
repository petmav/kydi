import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, PageHeader } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { ActionButton, ConfirmButton } from "@/components/confirm";
import { PaidBadge, StatusBadge } from "@/components/status-badges";
import { requirePortalCustomer } from "@/lib/auth/portal";
import { db } from "@/lib/db";
import { estimateTransitions } from "@/domain/status";
import { markViewed } from "@/server/email";
import { activeGateway, confirmStripeSession, payableAmount, type CheckoutOutcome } from "@/server/online-payments";
import { getCompanySettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { portalEstimateDecisionAction, portalPayInvoiceAction } from "../../../actions";

const CHECKOUT_NOTICE: Record<CheckoutOutcome, { tone: "success" | "info" | "warning"; title: string; body: string }> = {
  paid: { tone: "success", title: "Payment received", body: "Thank you! Your payment has been recorded and a receipt is listed under Payments." },
  pending: { tone: "info", title: "Payment processing", body: "Your payment is being confirmed. This page will show it as paid once it clears." },
  expired: { tone: "warning", title: "Checkout expired", body: "No payment was taken. You can start a new payment below." },
  invalid: { tone: "warning", title: "Payment not found", body: "We could not match this checkout to the invoice. No payment was recorded." },
  error: { tone: "info", title: "Payment processing", body: "We could not confirm your payment with the payment provider yet. If you completed it, it will appear here shortly; you will not be charged twice." },
};

export default async function PortalDocument({ params, searchParams }: { params: Promise<{ slug: string; kind: string; id: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { slug, kind, id: raw } = await params;
  const { checkout } = await searchParams;
  const id = Number(raw);
  if (!Number.isInteger(id) || !["invoices", "estimates", "payments"].includes(kind)) notFound();
  const { customer, company } = await requirePortalCustomer(slug);
  const base = { id, customerId: customer.id, companyId: company.id };
  let title = "";
  let badges: React.ReactNode = null;
  let actions: React.ReactNode = null;
  let notice: React.ReactNode = null;
  if (kind === "invoices") {
    const inv = await db.invoice.findFirst({ where: { ...base, status: { not: "DRAFT" } } });
    if (!inv) notFound();
    await markViewed("invoice", inv.id);
    title = inv.invoiceNumber;
    if (checkout) {
      const n = CHECKOUT_NOTICE[await confirmStripeSession(company.id, checkout)];
      notice = <Alert tone={n.tone} title={n.title}>{n.body}</Alert>;
    }
    const fresh = checkout ? await db.invoice.findUniqueOrThrow({ where: { id: inv.id } }) : inv;
    badges = (<><StatusBadge kind="inv" value={fresh.status === "SENT" ? "VIEWED" : fresh.status} />{fresh.type === "INVOICE" ? <PaidBadge paidStatus={fresh.paidStatus} overdue={fresh.overdue} /> : null}</>);
    const due = fresh.type === "INVOICE" && (await activeGateway(company.id)) ? await payableAmount(company.id, customer.id, inv.id) : 0;
    if (due > 0) {
      const s = await getCompanySettings(company.id);
      actions = <ActionButton action={portalPayInvoiceAction.bind(null, slug, inv.id)} variant="primary">Pay {formatMoney(due, inv.currency, s.locale)}</ActionButton>;
    }
  } else if (kind === "estimates") {
    const est = await db.estimate.findFirst({ where: { ...base, status: { not: "DRAFT" } } });
    if (!est) notFound();
    await markViewed("estimate", est.id);
    const status = est.status === "SENT" ? "VIEWED" : est.status;
    title = est.estimateNumber;
    badges = <StatusBadge kind="est" value={status} />;
    if (estimateTransitions.canCustomerDecide(status)) {
      actions = (
        <>
          <ConfirmButton action={portalEstimateDecisionAction.bind(null, slug, est.id, "ACCEPTED")} title="Accept this estimate?" description="We will be notified and can proceed with the work." confirmLabel="Accept" variant="primary" confirmVariant="primary">Accept</ConfirmButton>
          <ConfirmButton action={portalEstimateDecisionAction.bind(null, slug, est.id, "REJECTED")} title="Reject this estimate?" confirmLabel="Reject">Reject</ConfirmButton>
        </>
      );
    }
  } else {
    const p = await db.payment.findFirst({ where: base });
    if (!p) notFound();
    title = p.paymentNumber;
  }
  const pdf = `/portal/${slug}/pdf/${kind}/${id}`;
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{title} {badges}</span>}
        back={<Link href={`/portal/${slug}/${kind}`} className="text-brand-700 hover:underline focus-ring rounded">← Back</Link>}
        actions={<>{actions}<a href={`${pdf}?download=1`} className={buttonClass("secondary")}>Download PDF</a></>}
      />
      {notice ? <div className="mb-4">{notice}</div> : null}
      <Card>
        <iframe src={pdf} title={`${title} PDF`} className="h-[80vh] w-full border-0" />
      </Card>
    </>
  );
}
