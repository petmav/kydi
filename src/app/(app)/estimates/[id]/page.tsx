import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@/components/ui/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { ActionButton, ConfirmButton } from "@/components/confirm";
import { StatusBadge } from "@/components/status-badges";
import { SendDialog } from "@/components/documents/send-dialog";
import { CopyLinkButton } from "@/components/documents/doc-actions";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, isoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getBaseUrl } from "@/lib/url";
import type { SearchParams } from "@/lib/list";
import { COMPANY_PLACEHOLDERS, CUSTOMER_PLACEHOLDERS, ESTIMATE_PLACEHOLDERS } from "@/lib/placeholders";
import { estimateTransitions } from "@/domain/status";
import { emailDefaults } from "@/server/email";
import { previewEmailAction, sendDocumentAction } from "../../documents/send-actions";
import { cloneEstimateAction, convertEstimateAction, deleteEstimateAction, setEstimateStatusAction } from "../actions";

export const metadata: Metadata = { title: "Estimate" };

export default async function EstimateDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-estimate")) return <Forbidden />;
  const id = parseId((await params).id);
  const sp = await searchParams;
  const est = await db.estimate.findFirst({ where: { id, companyId: ctx.companyId }, include: { customer: true } });
  if (!est) notFound();
  const s = ctx.settings;
  const money = (v: number | bigint) => formatMoney(v, est.currency, s.locale);
  const df = (d: Date | null) => (d ? formatDate(isoDate(d), s.date_format) : "—");
  const canSend = ctx.can("send-estimate");
  const defaults = canSend ? await emailDefaults(ctx.companyId, "estimate", est.id) : null;
  const emails = await db.emailLog.findMany({ where: { companyId: ctx.companyId, mailableType: "estimate", mailableId: est.id }, orderBy: { createdAt: "desc" }, take: 10 });
  const pdfUrl = `${await getBaseUrl()}/pdf/estimates/${est.uniqueHash}`;
  const decide = estimateTransitions.canDecide(est.status) && ctx.can("edit-estimate");
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{est.estimateNumber} <StatusBadge kind="est" value={est.status} /></span>}
        description={`Estimate for ${est.customer.name} · ${money(est.total)}`}
        back={<Link href="/estimates" className="text-brand-700 hover:underline focus-ring rounded">← Estimates</Link>}
        actions={
          <>
            {canSend && defaults ? (
              <SendDialog
                label={est.status === "SENT" || est.status === "VIEWED" ? "Resend" : "Send estimate"}
                title="Send estimate"
                action={sendDocumentAction.bind(null, "estimate", est.id)}
                preview={previewEmailAction.bind(null, "estimate", est.id)}
                defaults={defaults}
                placeholders={[...ESTIMATE_PLACEHOLDERS, ...CUSTOMER_PLACEHOLDERS, ...COMPANY_PLACEHOLDERS.slice(0, 1)]}
                autoOpen={sp.send === "1"}
              />
            ) : null}
            {estimateTransitions.canConvert(est.status) && ctx.can("create-invoice") ? (
              <ConfirmButton action={convertEstimateAction.bind(null, est.id)} title="Convert to invoice?" description="A draft invoice is created with the same customer, lines and totals." confirmLabel="Convert" variant="secondary" confirmVariant="primary">
                Convert to invoice
              </ConfirmButton>
            ) : null}
            {est.status !== "SENT" && canSend ? (
              <ConfirmButton action={setEstimateStatusAction.bind(null, est.id, "SENT")} title="Mark as sent?" description="The estimate is marked as sent without emailing the customer." confirmLabel="Mark as sent" variant="secondary" confirmVariant="primary">
                Mark as sent
              </ConfirmButton>
            ) : null}
            <a href={`/api/pdf/estimate/${est.id}?download=1`} className={buttonClass("secondary")}>Download PDF</a>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Customer", value: <Link href={`/customers/${est.customerId}`} className="text-brand-700 hover:underline">{est.customer.name}</Link> },
                  { label: "Date", value: df(est.estimateDate) },
                  { label: "Expiry date", value: df(est.expiryDate) },
                  { label: "Reference", value: est.referenceNumber },
                  { label: "Total", value: <span className="tabular">{money(est.total)}</span> },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Actions" />
            <CardBody className="flex flex-wrap gap-2">
              {ctx.can("edit-estimate") ? <ButtonLink href={`/estimates/${est.id}/edit`} variant="secondary">Edit</ButtonLink> : null}
              {ctx.can("create-estimate") ? <ActionButton action={cloneEstimateAction.bind(null, est.id)}>Clone</ActionButton> : null}
              {decide ? (
                <>
                  <ConfirmButton action={setEstimateStatusAction.bind(null, est.id, "ACCEPTED")} title="Mark as accepted?" confirmLabel="Mark accepted" variant="secondary" confirmVariant="primary">Mark as accepted</ConfirmButton>
                  <ConfirmButton action={setEstimateStatusAction.bind(null, est.id, "REJECTED")} title="Mark as rejected?" confirmLabel="Mark rejected" variant="secondary">Mark as rejected</ConfirmButton>
                </>
              ) : null}
              <CopyLinkButton url={pdfUrl} />
              {ctx.can("delete-estimate") ? (
                <ConfirmButton action={deleteEstimateAction.bind(null, est.id)} title={`Delete ${est.estimateNumber}?`} description="This cannot be undone." confirmLabel="Delete">Delete</ConfirmButton>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Email history" />
            {emails.length === 0 ? (
              <CardBody className="text-sm text-muted">Not emailed yet.</CardBody>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {emails.map((e) => (
                  <li key={e.id} className="px-5 py-2">
                    <p className="font-medium">{e.subject}</p>
                    <p className="text-xs text-muted">{formatDateTime(e.createdAt, s.time_zone)} · to {e.to}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card className="lg:col-span-2">
          <CardHeader title="Preview" actions={<a href={`/api/pdf/estimate/${est.id}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>Open PDF</a>} />
          <iframe src={`/api/pdf/estimate/${est.id}`} title={`${est.estimateNumber} PDF preview`} className="h-[80vh] w-full border-0" />
        </Card>
      </div>
    </>
  );
}
