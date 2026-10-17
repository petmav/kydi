import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, CardBody, CardHeader, DescriptionList, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { ConfirmButton } from "@/components/confirm";
import { ModalForm } from "@/components/modal";
import { TextareaField } from "@/components/form";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { deleteSupplierPaymentAction, voidSupplierPaymentAction } from "../../purchases/actions";

export const metadata: Metadata = { title: "Supplier payment" };

export default async function SupplierPaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  const id = parseId((await params).id);
  const p = await db.supplierPayment.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      supplier: true,
      paymentMethod: true,
      settlements: { include: { bill: { select: { id: true, number: true, total: true, dueAmount: true } } } },
      refunds: { select: { id: true, number: true, amount: true, status: true } },
      refundOfPayment: { select: { id: true, number: true } },
      refundOfCredit: { select: { id: true, number: true } },
    },
  });
  if (!p) notFound();
  const refund = p.type === "REFUND";
  if (!ctx.can(refund ? "view-supplier-refund" : "view-supplier-payment")) return <Forbidden />;
  const s = ctx.settings;
  const money = (v: number | bigint) => formatMoney(v, p.currency, s.locale);
  const allocated = p.settlements.reduce((sum, x) => sum + Number(x.amount), 0);
  const refunded = p.refunds.filter((r) => r.status === "OPEN").reduce((sum, r) => sum + Number(r.amount), 0);
  const remaining = Number(p.amount) - allocated - refunded;
  const label = refund ? "Supplier refund" : "Supplier payment";
  return (
    <>
      <PageHeader
        title={`${label} ${p.number}`}
        description={p.supplier.name}
        back={<Link href={refund ? "/supplier-payments?tab=refunds" : "/supplier-payments"} className="text-brand-700 hover:underline focus-ring rounded">← Supplier payments</Link>}
        actions={
          p.status === "OPEN" ? (
            <>
              {!refund && remaining > 0 && ctx.can("create-supplier-refund") ? <ButtonLink href={`/supplier-payments/refund/new?source=payment:${p.id}`} variant="secondary">Record refund</ButtonLink> : null}
              {!refund && ctx.can("edit-supplier-payment") ? <ButtonLink href={`/supplier-payments/${p.id}/edit`} variant="secondary">Edit</ButtonLink> : null}
              {ctx.can(refund ? "edit-supplier-refund" : "edit-supplier-payment") ? (
                <ModalForm trigger="Void" title={`Void ${p.number}?`} description={refund ? "The refund stays on record but no longer counts." : "Its allocations are removed and the bills become due again."} action={voidSupplierPaymentAction.bind(null, p.id, refund)} variant="outline-danger" submitLabel="Void">
                  <TextareaField name="reason" label="Reason" required maxLength={500} />
                </ModalForm>
              ) : null}
              {ctx.can(refund ? "delete-supplier-refund" : "delete-supplier-payment") ? (
                <ConfirmButton action={deleteSupplierPaymentAction.bind(null, p.id, refund)} title={`Delete ${p.number}?`} description="Only payments without allocations or refunds can be deleted." confirmLabel="Delete" redirectTo="/supplier-payments">
                  Delete
                </ConfirmButton>
              ) : null}
            </>
          ) : null
        }
      />
      {p.status === "VOID" ? (
        <div className="mb-6">
          <Alert tone="warning" title={`Voided on ${p.voidedAt ? formatDate(isoDate(p.voidedAt), s.date_format) : "—"}`}>
            Reason: {p.voidReason}
          </Alert>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DescriptionList
              items={[
                { label: "Status", value: p.status === "VOID" ? <Badge tone="red">Void</Badge> : <Badge tone="blue">Open</Badge> },
                { label: "Supplier", value: <Link href={`/suppliers/${p.supplierId}`} className="text-brand-700 hover:underline">{p.supplier.name}</Link> },
                { label: "Date", value: formatDate(isoDate(p.paymentDate), s.date_format) },
                { label: "Amount", value: money(p.amount) },
                { label: "Payment mode", value: p.paymentMethod?.name ?? null },
                { label: "Reference", value: p.reference },
                ...(p.currency !== s.currency ? [{ label: "Exchange rate", value: `1 ${p.currency} = ${p.exchangeRate} ${s.currency}` }] : []),
                ...(refund
                  ? [
                      {
                        label: "Refund of",
                        value: p.refundOfPayment ? (
                          <Link href={`/supplier-payments/${p.refundOfPayment.id}`} className="text-brand-700 hover:underline">Payment {p.refundOfPayment.number}</Link>
                        ) : p.refundOfCredit ? (
                          <Link href={`/bills/${p.refundOfCredit.id}`} className="text-brand-700 hover:underline">Credit {p.refundOfCredit.number}</Link>
                        ) : null,
                      },
                    ]
                  : [
                      { label: "Allocated", value: money(allocated) },
                      { label: "Refunded", value: money(refunded) },
                      { label: "Unallocated", value: money(Math.max(0, remaining)) },
                    ]),
              ]}
            />
            {p.notes ? <div className="rte-content mt-4 border-t border-line pt-3 text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.notes) }} /> : null}
          </CardBody>
        </Card>
        {!refund ? (
          <Card className="lg:col-span-2">
            <CardHeader title="Allocations" />
            {p.settlements.length === 0 ? (
              <CardBody className="text-sm text-muted">Not applied to any bill.</CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Bill</Th>
                    <Th className="text-right">Bill total</Th>
                    <Th className="text-right">Allocated</Th>
                    <Th className="text-right">Bill due now</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {p.settlements.map((x) => (
                    <tr key={x.id}>
                      <Td>
                        <Link href={`/bills/${x.bill.id}`} className="text-brand-700 hover:underline">{x.bill.number}</Link>
                      </Td>
                      <Td className="tabular text-right">{money(x.bill.total)}</Td>
                      <Td className="tabular text-right">{money(x.amount)}</Td>
                      <Td className="tabular text-right">{money(x.bill.dueAmount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
