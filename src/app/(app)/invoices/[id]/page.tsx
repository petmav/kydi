import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, CardBody, CardHeader, DescriptionList, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { ActionButton, ConfirmButton } from "@/components/confirm";
import { CreditedBadge, PaidBadge, StatusBadge } from "@/components/status-badges";
import { SendDialog } from "@/components/documents/send-dialog";
import { CopyLinkButton, CreditNoteButton } from "@/components/documents/doc-actions";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, isoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getBaseUrl } from "@/lib/url";
import type { SearchParams } from "@/lib/list";
import { COMPANY_PLACEHOLDERS, CUSTOMER_PLACEHOLDERS, INVOICE_PLACEHOLDERS } from "@/lib/placeholders";
import { invoiceAllowEdit } from "@/domain/status";
import { emailDefaults } from "@/server/email";
import { creditedQuantities } from "@/server/invoices";
import { previewEmailAction, sendDocumentAction } from "../../documents/send-actions";
import { cloneInvoiceAction, convertInvoiceToEstimateAction, createCreditNoteAction, deleteInvoiceAction, markInvoiceCompletedAction, markInvoiceSentAction } from "../actions";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-invoice")) return <Forbidden />;
  const id = parseId((await params).id);
  const sp = await searchParams;
  const inv = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      customer: true,
      lines: { orderBy: { position: "asc" } },
      creditNotes: { select: { id: true, invoiceNumber: true, total: true } },
      relatedInvoice: { select: { id: true, invoiceNumber: true } },
      allocations: { include: { payment: { select: { id: true, paymentNumber: true, paymentDate: true } } } },
      recurringInvoice: { select: { id: true } },
    },
  });
  if (!inv) notFound();
  const s = ctx.settings;
  const money = (v: number | bigint) => formatMoney(v, inv.currency, s.locale);
  const df = (d: Date | null) => (d ? formatDate(isoDate(d), s.date_format) : "—");
  const isCredit = inv.type === "CREDIT_NOTE";
  const credited = Math.abs(inv.creditNotes.reduce((a, c) => a + Number(c.total), 0));
  const paid = inv.allocations.reduce((a, x) => a + Number(x.amount), 0);
  const allowEdit = !isCredit && invoiceAllowEdit(inv.paidStatus, inv.creditNotes.length > 0, s.retrospective_edits);
  const canSend = ctx.can("send-invoice");
  const defaults = canSend ? await emailDefaults(ctx.companyId, "invoice", inv.id) : null;
  const emails = await db.emailLog.findMany({ where: { companyId: ctx.companyId, mailableType: "invoice", mailableId: inv.id }, orderBy: { createdAt: "desc" }, take: 10 });
  const pdfUrl = `${await getBaseUrl()}/pdf/invoices/${inv.uniqueHash}`;
  const creditedQty = await creditedQuantities(inv.id);
  const creditable = !isCredit && inv.status !== "DRAFT" && credited < Number(inv.total) && Number(inv.total) - paid - credited > 0;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {inv.invoiceNumber}
            <StatusBadge kind="inv" value={inv.status} />
            {!isCredit ? <PaidBadge paidStatus={inv.paidStatus} overdue={inv.overdue} /> : null}
            <CreditedBadge credited={credited} total={Number(inv.total)} />
          </span>
        }
        description={`${isCredit ? "Credit note" : "Invoice"} for ${inv.customer.name} · ${money(inv.total)}`}
        back={<Link href="/invoices" className="text-brand-700 hover:underline focus-ring rounded">← Invoices</Link>}
        actions={
          <>
            {canSend && defaults ? (
              <SendDialog
                label={inv.status === "DRAFT" ? (isCredit ? "Send credit note" : "Send invoice") : "Resend"}
                title={isCredit ? "Send credit note" : "Send invoice"}
                action={sendDocumentAction.bind(null, "invoice", inv.id)}
                preview={previewEmailAction.bind(null, "invoice", inv.id)}
                defaults={defaults}
                placeholders={[...INVOICE_PLACEHOLDERS, ...CUSTOMER_PLACEHOLDERS, ...COMPANY_PLACEHOLDERS.slice(0, 1)]}
                autoOpen={sp.send === "1"}
              />
            ) : null}
            {!isCredit && inv.status !== "DRAFT" && Number(inv.dueAmount) > 0 && ctx.can("create-payment") ? (
              <ButtonLink href={`/payments/new?invoice=${inv.id}`} variant="secondary">Record payment</ButtonLink>
            ) : null}
            {inv.status === "DRAFT" && canSend ? (
              <ConfirmButton action={markInvoiceSentAction.bind(null, inv.id)} title="Mark as sent?" description="The invoice is marked as sent without emailing the customer." confirmLabel="Mark as sent" variant="secondary" confirmVariant="primary">
                Mark as sent
              </ConfirmButton>
            ) : null}
            <a href={`/api/pdf/invoice/${inv.id}?download=1`} className={buttonClass("secondary")}>Download PDF</a>
          </>
        }
      />
      {isCredit && inv.relatedInvoice ? (
        <div className="mb-4">
          <Alert tone="info" title="Credit note">
            For original invoice <Link className="font-medium underline" href={`/invoices/${inv.relatedInvoice.id}`}>{inv.relatedInvoice.invoiceNumber}</Link>
            {inv.creditReason ? ` · Reason: ${inv.creditReason}` : ""}
          </Alert>
        </div>
      ) : null}
      {!isCredit && inv.creditNotes.length ? (
        <div className="mb-4">
          <Alert tone={credited >= Number(inv.total) ? "error" : "warning"} title={credited >= Number(inv.total) ? "Cancelled via credit note" : "Partially credited"}>
            {money(credited)} credited via{" "}
            {inv.creditNotes.map((c, i) => (
              <span key={c.id}>
                {i ? ", " : ""}
                <Link className="font-medium underline" href={`/invoices/${c.id}`}>{c.invoiceNumber}</Link>
              </span>
            ))}
          </Alert>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Customer", value: <Link href={`/customers/${inv.customerId}`} className="text-brand-700 hover:underline">{inv.customer.name}</Link> },
                  {
                    label: "Customer portal",
                    value: inv.customer.enablePortal && inv.customer.email
                      ? `Access on · signs in with ${inv.customer.email}`
                      : !inv.customer.email
                        ? "No email address, so the customer cannot get portal access"
                        : inv.customer.portalOptOut
                          ? "Switched off for this customer"
                          : ctx.settings.auto_portal_access === "YES"
                            ? "Switches on when the invoice is sent"
                            : "Off",
                  },
                  { label: "Date", value: df(inv.invoiceDate) },
                  { label: "Due date", value: df(inv.dueDate) },
                  { label: "Reference", value: inv.referenceNumber },
                  { label: "Total", value: <span className="tabular">{money(inv.total)}</span> },
                  { label: "Amount due", value: <span className="tabular">{money(inv.dueAmount)}</span> },
                  ...(inv.currency !== s.currency ? [{ label: "Exchange rate", value: `1 ${inv.currency} = ${inv.exchangeRate} ${s.currency}` }] : []),
                  ...(inv.recurringInvoice ? [{ label: "Generated by", value: <Link href={`/recurring-invoices/${inv.recurringInvoice.id}`} className="text-brand-700 hover:underline">Recurring schedule</Link> }] : []),
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Actions" />
            <CardBody className="flex flex-wrap gap-2">
              {allowEdit && ctx.can("edit-invoice") ? <ButtonLink href={`/invoices/${inv.id}/edit`} variant="secondary">Edit</ButtonLink> : null}
              {!isCredit && ctx.can("create-invoice") ? <ActionButton action={cloneInvoiceAction.bind(null, inv.id)}>Clone</ActionButton> : null}
              {!isCredit && ctx.can("create-estimate") ? (
                <ConfirmButton action={convertInvoiceToEstimateAction.bind(null, inv.id)} title="Convert to estimate?" description="A new draft estimate is created from this invoice." confirmLabel="Convert" variant="secondary" confirmVariant="primary">
                  Convert to estimate
                </ConfirmButton>
              ) : null}
              {creditable && ctx.can("create-invoice") ? (
                <CreditNoteButton
                  action={createCreditNoteAction.bind(null, inv.id)}
                  lines={inv.lines.map((l) => {
                    const c = creditedQty.get(l.id) ?? 0;
                    return { id: l.id, name: l.name, price: money(l.price), quantity: l.quantity, credited: c, remaining: Math.max(0, Math.round((l.quantity - c) * 100) / 100) };
                  })}
                />
              ) : null}
              {!isCredit && inv.status !== "COMPLETED" && Number(inv.dueAmount) === 0 && ctx.can("edit-invoice") ? (
                <ActionButton action={markInvoiceCompletedAction.bind(null, inv.id)}>Mark as completed</ActionButton>
              ) : null}
              <CopyLinkButton url={pdfUrl} />
              {ctx.can("delete-invoice") ? (
                <ConfirmButton action={deleteInvoiceAction.bind(null, inv.id)} title={`Delete ${inv.invoiceNumber}?`} description={inv.allocations.length ? "This invoice has payment allocations and cannot be deleted until they are removed." : "This cannot be undone."} confirmLabel="Delete">
                  Delete
                </ConfirmButton>
              ) : null}
            </CardBody>
          </Card>
          {!isCredit ? (
            <Card>
              <CardHeader title="Payments" />
              {inv.allocations.length === 0 ? (
                <CardBody className="text-sm text-muted">No payments allocated yet.</CardBody>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Payment</Th>
                      <Th>Date</Th>
                      <Th className="text-right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {inv.allocations.map((a) => (
                      <tr key={a.id}>
                        <Td><Link href={`/payments/${a.payment.id}`} className="text-brand-700 hover:underline">{a.payment.paymentNumber}</Link></Td>
                        <Td>{df(a.payment.paymentDate)}</Td>
                        <Td className="tabular text-right">{money(a.amount)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          ) : null}
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
          <CardHeader title="Preview" actions={<a href={`/api/pdf/invoice/${inv.id}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>Open PDF</a>} />
          <iframe src={`/api/pdf/invoice/${inv.id}`} title={`${inv.invoiceNumber} PDF preview`} className="h-[80vh] w-full border-0" />
        </Card>
      </div>
    </>
  );
}
