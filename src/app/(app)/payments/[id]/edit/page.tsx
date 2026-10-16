import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { PaymentForm } from "@/components/payments/payment-form";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { minorToInput } from "@/lib/money";
import { isoDate } from "@/lib/dates";
import { loadCustomFieldAnswers } from "@/lib/custom-fields";
import { lookupRateAction } from "../../../documents/actions";
import { openInvoicesAction, savePaymentAction } from "../../actions";
import { paymentFormData } from "../../form-data";

export const metadata: Metadata = { title: "Edit payment" };

export default async function EditPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("edit-payment")) return <Forbidden />;
  const id = parseId((await params).id);
  const p = await db.payment.findFirst({ where: { id, companyId: ctx.companyId }, include: { allocations: true } });
  if (!p) notFound();
  const data = await paymentFormData(ctx);
  return (
    <>
      <PageHeader title={`Edit ${p.paymentNumber}`} back={<Link href={`/payments/${p.id}`} className="text-brand-700 hover:underline focus-ring rounded">← {p.paymentNumber}</Link>} />
      <PaymentForm
        action={savePaymentAction.bind(null, p.id)}
        customers={data.customers}
        methods={data.methods}
        notes={data.notes}
        company={data.company}
        initial={{
          customerId: p.customerId,
          paymentDate: isoDate(p.paymentDate),
          paymentNumber: p.paymentNumber,
          amount: minorToInput(p.amount),
          exchangeRate: String(p.exchangeRate),
          paymentMethodId: p.paymentMethodId ? String(p.paymentMethodId) : "",
          notes: p.notes ?? "",
          allocations: p.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: minorToInput(a.amount) })),
        }}
        paymentId={p.id}
        invoicesAction={openInvoicesAction}
        rateAction={lookupRateAction}
        customFields={data.customFields}
        customValues={await loadCustomFieldAnswers("Payment", p.id)}
        cancelHref={`/payments/${p.id}`}
        lockCustomer={p.allocations.length > 0}
      />
    </>
  );
}
