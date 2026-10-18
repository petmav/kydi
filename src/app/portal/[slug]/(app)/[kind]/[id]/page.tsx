import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm";
import { PaidBadge, StatusBadge } from "@/components/status-badges";
import { requirePortalCustomer } from "@/lib/auth/portal";
import { db } from "@/lib/db";
import { estimateTransitions } from "@/domain/status";
import { markViewed } from "@/server/email";
import { portalEstimateDecisionAction } from "../../../actions";

export default async function PortalDocument({ params }: { params: Promise<{ slug: string; kind: string; id: string }> }) {
  const { slug, kind, id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || !["invoices", "estimates", "payments"].includes(kind)) notFound();
  const { customer, company } = await requirePortalCustomer(slug);
  const base = { id, customerId: customer.id, companyId: company.id };
  let title = "";
  let badges: React.ReactNode = null;
  let actions: React.ReactNode = null;
  if (kind === "invoices") {
    const inv = await db.invoice.findFirst({ where: { ...base, status: { not: "DRAFT" } } });
    if (!inv) notFound();
    await markViewed("invoice", inv.id);
    title = inv.invoiceNumber;
    badges = (<><StatusBadge kind="inv" value={inv.status === "SENT" ? "VIEWED" : inv.status} />{inv.type === "INVOICE" ? <PaidBadge paidStatus={inv.paidStatus} overdue={inv.overdue} /> : null}</>);
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
      <Card data-tour="portal-document">
        <iframe src={pdf} title={`${title} PDF`} className="h-[80vh] w-full border-0" />
      </Card>
    </>
  );
}
