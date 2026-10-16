import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, DescriptionList, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { ConfirmButton } from "@/components/confirm";
import { SendDialog } from "@/components/documents/send-dialog";
import { CopyLinkButton } from "@/components/documents/doc-actions";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getBaseUrl } from "@/lib/url";
import { COMPANY_PLACEHOLDERS, CUSTOMER_PLACEHOLDERS, PAYMENT_PLACEHOLDERS } from "@/lib/placeholders";
import { emailDefaults } from "@/server/email";
import { previewEmailAction, sendDocumentAction } from "../../documents/send-actions";
import { deletePaymentAction } from "../actions";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-payment")) return <Forbidden />;
  const id = parseId((await params).id);
  const p = await db.payment.findFirst({ where: { id, companyId: ctx.companyId }, include: { customer: true, paymentMethod: true, allocations: { include: { invoice: true } } } });
  if (!p) notFound();
  const s = ctx.settings;
  const money = (v: number | bigint) => formatMoney(v, p.currency, s.locale);
  const allocated = p.allocations.reduce((a, x) => a + Number(x.amount), 0);
  const defaults = ctx.can("send-payment") ? await emailDefaults(ctx.companyId, "payment", p.id) : null;
  return (
    <>
      <PageHeader
        title={p.paymentNumber}
        description={`Payment from ${p.customer.name} · ${money(p.amount)}`}
        back={<Link href="/payments" className="text-brand-700 hover:underline focus-ring rounded">← Payments</Link>}
        actions={
          <>
            {defaults ? (
              <SendDialog label="Send receipt" title="Send payment receipt" action={sendDocumentAction.bind(null, "payment", p.id)} preview={previewEmailAction.bind(null, "payment", p.id)} defaults={defaults} placeholders={[...PAYMENT_PLACEHOLDERS, ...CUSTOMER_PLACEHOLDERS, ...COMPANY_PLACEHOLDERS.slice(0, 1)]} />
            ) : null}
            {ctx.can("edit-payment") ? <ButtonLink href={`/payments/${p.id}/edit`} variant="secondary">Edit</ButtonLink> : null}
            <a href={`/api/pdf/payment/${p.id}?download=1`} className={buttonClass("secondary")}>Download PDF</a>
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
                  { label: "Customer", value: <Link href={`/customers/${p.customerId}`} className="text-brand-700 hover:underline">{p.customer.name}</Link> },
                  { label: "Date", value: formatDate(isoDate(p.paymentDate), s.date_format) },
                  { label: "Payment mode", value: p.paymentMethod?.name },
                  { label: "Amount", value: <span className="tabular">{money(p.amount)}</span> },
                  { label: "Allocated", value: <span className="tabular">{money(allocated)}</span> },
                  { label: "Unapplied credit", value: <span className="tabular">{money(Number(p.amount) - allocated)}</span> },
                  ...(p.currency !== s.currency ? [{ label: "Exchange rate", value: `1 ${p.currency} = ${p.exchangeRate} ${s.currency}` }] : []),
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Applied to" />
            {p.allocations.length === 0 ? (
              <CardBody className="text-sm text-muted">Not applied to any invoice. The full amount is available as customer credit.</CardBody>
            ) : (
              <Table>
                <thead><tr><Th>Invoice</Th><Th className="text-right">Amount</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {p.allocations.map((a) => (
                    <tr key={a.id}>
                      <Td><Link href={`/invoices/${a.invoiceId}`} className="text-brand-700 hover:underline">{a.invoice.invoiceNumber}</Link></Td>
                      <Td className="tabular text-right">{money(a.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card>
            <CardBody className="flex flex-wrap gap-2">
              <CopyLinkButton url={`${await getBaseUrl()}/pdf/payments/${p.uniqueHash}`} />
              {ctx.can("delete-payment") ? (
                <ConfirmButton action={deletePaymentAction.bind(null, p.id)} title={`Delete ${p.paymentNumber}?`} description="Allocations are removed and the affected invoices become due again." confirmLabel="Delete">Delete</ConfirmButton>
              ) : null}
            </CardBody>
          </Card>
        </div>
        <Card className="lg:col-span-2">
          <CardHeader title="Receipt" />
          <iframe src={`/api/pdf/payment/${p.id}`} title={`${p.paymentNumber} receipt preview`} className="h-[80vh] w-full border-0" />
        </Card>
      </div>
    </>
  );
}
