import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, CardBody, CardHeader, DescriptionList, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { ConfirmButton } from "@/components/confirm";
import { ModalForm } from "@/components/modal";
import { TextareaField } from "@/components/form";
import { CreditAllocationForm } from "@/components/purchasing/forms";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/dates";
import { formatMoney, minorToInput } from "@/lib/money";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { BILL_STATUS_TONE, openBillOptions } from "../../purchases/data";
import { allocateCreditAction, deleteBillAction, openBillAction, voidBillAction } from "../../purchases/actions";

export const metadata: Metadata = { title: "Bill" };

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  const id = parseId((await params).id);
  const b = await db.bill.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      supplier: true,
      lines: { include: { taxes: true, expenseCategory: { select: { name: true } } }, orderBy: { position: "asc" } },
      settlements: { include: { supplierPayment: { select: { id: true, number: true, paymentDate: true } }, credit: { select: { id: true, number: true, documentDate: true } } } },
      creditSettlements: { include: { bill: { select: { id: true, number: true } } } },
      credits: { select: { id: true, number: true, status: true, total: true } },
      refunds: { select: { id: true, number: true, status: true, amount: true, paymentDate: true } },
      sourceBill: { select: { id: true, number: true } },
    },
  });
  if (!b) notFound();
  const credit = b.type === "SUPPLIER_CREDIT";
  if (!ctx.can(credit ? "view-supplier-credit" : "view-bill")) return <Forbidden />;
  const s = ctx.settings;
  const money = (v: number | bigint) => formatMoney(v, b.currency, s.locale);
  const df = (d: Date | null) => (d ? formatDate(isoDate(d), s.date_format) : "—");
  const editAbility = credit ? "edit-supplier-credit" : "edit-bill";
  const statusLabel = b.status === "OPEN" ? (!credit && Number(b.dueAmount) === 0 ? "Paid" : "Open") : b.status === "DRAFT" ? "Draft" : "Void";
  const taxSummary = new Map<string, number>();
  for (const l of b.lines) for (const t of l.taxes) taxSummary.set(t.calculationType === "PERCENTAGE" ? `${t.name} ${t.percent}%` : t.name, (taxSummary.get(t.calculationType === "PERCENTAGE" ? `${t.name} ${t.percent}%` : t.name) ?? 0) + Number(t.amount));
  const refunded = b.refunds.filter((r) => r.status === "OPEN").reduce((sum, r) => sum + Number(r.amount), 0);
  const allocated = b.creditSettlements.reduce((sum, x) => sum + Number(x.amount), 0);
  const creditBills = credit && b.status === "OPEN" ? (await openBillOptions(ctx.companyId, b.supplierId)).filter((x) => x.currency === b.currency) : [];
  const notesHtml = b.notes ? sanitizeHtml(b.notes) : "";

  return (
    <>
      <PageHeader
        title={`${credit ? "Supplier credit" : "Bill"} ${b.number}`}
        description={`${b.supplier.name}${b.reference ? ` · Ref. ${b.reference}` : ""}`}
        back={<Link href={credit ? "/bills?tab=credits" : "/bills"} className="text-brand-700 hover:underline focus-ring rounded">← {credit ? "Supplier credits" : "Bills"}</Link>}
        actions={
          <>
            {!credit && b.status === "DRAFT" && ctx.can("edit-bill") ? (
              <ConfirmButton action={openBillAction.bind(null, b.id)} title="Open this bill?" description="Open bills become payable and appear in payables." confirmLabel="Open bill" variant="primary" confirmVariant="primary">
                Open bill
              </ConfirmButton>
            ) : null}
            {!credit && b.status === "OPEN" && Number(b.dueAmount) > 0 && ctx.can("create-supplier-payment") ? <ButtonLink href={`/supplier-payments/new?supplier=${b.supplierId}&bill=${b.id}`}>Record payment</ButtonLink> : null}
            {!credit && b.status === "OPEN" && ctx.can("create-supplier-credit") ? <ButtonLink href={`/bills/new?type=credit&from=${b.id}`} variant="secondary">Create credit</ButtonLink> : null}
            {credit && b.status === "OPEN" && ctx.can("create-supplier-refund") && Number(b.total) - allocated - refunded > 0 ? <ButtonLink href={`/supplier-payments/refund/new?source=credit:${b.id}`} variant="secondary">Record refund</ButtonLink> : null}
            {b.status !== "VOID" && ctx.can(editAbility) ? <ButtonLink href={`/bills/${b.id}/edit`} variant="secondary">Edit</ButtonLink> : null}
            {b.status !== "VOID" && b.status !== "DRAFT" && ctx.can(editAbility) ? (
              <ModalForm trigger="Void" title={`Void ${b.number}?`} description="A void document stays on record with its reason but no longer counts." action={voidBillAction.bind(null, b.id, credit)} variant="outline-danger" submitLabel="Void">
                <TextareaField name="reason" label="Reason" required maxLength={500} />
              </ModalForm>
            ) : null}
            {ctx.can(credit ? "delete-supplier-credit" : "delete-bill") ? (
              <ConfirmButton action={deleteBillAction.bind(null, b.id, credit)} title={`Delete ${b.number}?`} description="Only documents without payments, credits or refunds can be deleted. This cannot be undone." confirmLabel="Delete" redirectTo={credit ? "/bills?tab=credits" : "/bills"}>
                Delete
              </ConfirmButton>
            ) : null}
          </>
        }
      />
      {b.status === "VOID" ? (
        <div className="mb-6">
          <Alert tone="warning" title={`Voided on ${df(b.voidedAt)}`}>
            Reason: {b.voidReason}
          </Alert>
        </div>
      ) : b.financialLockedAt ? (
        <div className="mb-6">
          <Alert tone="info">This bill has payments or credits applied, so its amounts are locked. Reference, due date and notes can still be edited.</Alert>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DescriptionList
              items={[
                { label: "Status", value: <Badge tone={statusLabel === "Paid" ? "green" : BILL_STATUS_TONE[b.status]}>{statusLabel}</Badge> },
                { label: "Supplier", value: <Link href={`/suppliers/${b.supplierId}`} className="text-brand-700 hover:underline">{b.supplier.name}</Link> },
                { label: credit ? "Credit date" : "Bill date", value: df(b.documentDate) },
                ...(credit ? [] : [{ label: "Due date", value: df(b.dueDate) }]),
                { label: "Currency", value: b.currency !== s.currency ? `${b.currency} (1 = ${b.exchangeRate} ${s.currency})` : b.currency },
                { label: "Total", value: money(b.total) },
                ...(credit ? [{ label: "Available", value: money(Math.max(0, Number(b.total) - allocated - refunded)) }] : [{ label: "Amount due", value: money(b.dueAmount) }]),
                ...(b.sourceBill ? [{ label: "Raised against", value: <Link href={`/bills/${b.sourceBill.id}`} className="text-brand-700 hover:underline">{b.sourceBill.number}</Link> }] : []),
              ]}
            />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Lines" />
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Description</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Discount</Th>
                <Th className="text-right">Tax</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {b.lines.map((l) => (
                <tr key={l.id}>
                  <Td className="text-muted">{l.expenseCategory.name}</Td>
                  <Td className="whitespace-normal">{l.description}</Td>
                  <Td className="tabular text-right">{l.quantity}</Td>
                  <Td className="tabular text-right">{money(l.price)}</Td>
                  <Td className="tabular text-right">{Number(l.discountVal) ? money(l.discountVal) : "—"}</Td>
                  <Td className="tabular text-right">{Number(l.tax) ? money(l.tax) : "—"}</Td>
                  <Td className="tabular text-right">{money(l.total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <CardBody>
            <dl className="ml-auto grid max-w-xs grid-cols-2 gap-1 text-sm">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular text-right">{money(b.subTotal)}</dd>
              {[...taxSummary].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="tabular text-right">{money(v)}</dd>
                </div>
              ))}
              <dt className="font-semibold">Total</dt>
              <dd className="tabular text-right font-semibold">{money(b.total)}</dd>
              {!credit ? (
                <>
                  <dt className="text-muted">Paid and credited</dt>
                  <dd className="tabular text-right">{money(b.status === "VOID" ? 0 : Number(b.total) - Number(b.dueAmount))}</dd>
                  <dt className="font-semibold">Due</dt>
                  <dd className="tabular text-right font-semibold">{money(b.dueAmount)}</dd>
                </>
              ) : null}
            </dl>
            {notesHtml ? <div className="rte-content mt-4 border-t border-line pt-3 text-sm" dangerouslySetInnerHTML={{ __html: notesHtml }} /> : null}
          </CardBody>
        </Card>
        {!credit ? (
          <Card className="lg:col-span-3">
            <CardHeader title="Payments and credits applied" />
            {b.settlements.length === 0 ? (
              <CardBody className="text-sm text-muted">Nothing applied yet.</CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Source</Th>
                    <Th>Date</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {b.settlements.map((x) => (
                    <tr key={x.id}>
                      <Td>
                        {x.supplierPayment ? (
                          <Link href={`/supplier-payments/${x.supplierPayment.id}`} className="text-brand-700 hover:underline">Payment {x.supplierPayment.number}</Link>
                        ) : x.credit ? (
                          <Link href={`/bills/${x.credit.id}`} className="text-brand-700 hover:underline">Credit {x.credit.number}</Link>
                        ) : null}
                      </Td>
                      <Td className="text-muted">{df(x.supplierPayment?.paymentDate ?? x.credit?.documentDate ?? null)}</Td>
                      <Td className="tabular text-right">{money(x.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        ) : (
          <>
            <Card className="lg:col-span-2">
              <CardHeader title="Apply to bills" description={`Allocate this credit to open bills of ${b.supplier.name} in ${b.currency}.`} />
              <CardBody>
                {b.status === "OPEN" && ctx.can("edit-supplier-credit") ? (
                  <CreditAllocationForm
                    action={allocateCreditAction.bind(null, b.id)}
                    bills={creditBills.concat(
                      b.creditSettlements.filter((x) => !creditBills.some((c) => c.id === x.bill.id)).map((x) => ({ id: x.bill.id, supplierId: b.supplierId, number: x.bill.number, currency: b.currency, due: 0, dueDate: null, documentDate: "" })),
                    )}
                    available={Number(b.total) - refunded}
                    currency={b.currency}
                    locale={s.locale}
                    initial={b.creditSettlements.map((x) => ({ billId: String(x.bill.id), amount: minorToInput(x.amount) }))}
                  />
                ) : b.creditSettlements.length ? (
                  <ul className="text-sm">
                    {b.creditSettlements.map((x) => (
                      <li key={x.id}>
                        {x.bill.number}: {money(x.amount)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Not applied to any bill.</p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Refunds" />
              <CardBody className="text-sm">
                {b.refunds.length === 0 ? (
                  <p className="text-muted">No refunds.</p>
                ) : (
                  <ul className="space-y-1">
                    {b.refunds.map((r) => (
                      <li key={r.id} className="flex justify-between">
                        <Link href={`/supplier-payments/${r.id}`} className="text-brand-700 hover:underline">
                          {r.number} {r.status === "VOID" ? "(void)" : ""}
                        </Link>
                        <span className="tabular">{money(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </>
        )}
        {!credit && b.credits.length ? (
          <Card className="lg:col-span-3">
            <CardHeader title="Credits raised against this bill" />
            <CardBody className="flex flex-wrap gap-3 text-sm">
              {b.credits.map((c) => (
                <Link key={c.id} href={`/bills/${c.id}`} className="text-brand-700 hover:underline">
                  {c.number} · {money(c.total)} {c.status === "VOID" ? "(void)" : ""}
                </Link>
              ))}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
