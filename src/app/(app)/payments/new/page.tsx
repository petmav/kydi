import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { PaymentForm } from "@/components/payments/payment-form";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { minorToInput } from "@/lib/money";
import { todayIn } from "@/lib/dates";
import type { SearchParams } from "@/lib/list";
import { lookupRateAction, suggestNumberAction } from "../../documents/actions";
import { openInvoicesAction, savePaymentAction } from "../actions";
import { paymentFormData } from "../form-data";

export const metadata: Metadata = { title: "Record payment" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("create-payment")) return <Forbidden />;
  const sp = await searchParams;
  const data = await paymentFormData(ctx);
  const inv = Number(sp.invoice) ? await db.invoice.findFirst({ where: { id: Number(sp.invoice), companyId: ctx.companyId, type: "INVOICE" } }) : null;
  const customerId = inv?.customerId ?? (Number(sp.customer) || null);
  const due = inv ? Number(inv.dueAmount) : 0;
  return (
    <>
      <PageHeader title="Record payment" back={<Link href="/payments" className="text-brand-700 hover:underline focus-ring rounded">← Payments</Link>} />
      <PaymentForm
        action={savePaymentAction.bind(null, null)}
        customers={data.customers}
        methods={data.methods}
        notes={data.notes}
        company={data.company}
        initial={{
          customerId,
          paymentDate: todayIn(ctx.settings.time_zone),
          paymentNumber: "",
          amount: due ? minorToInput(due) : "",
          exchangeRate: inv && inv.currency !== ctx.settings.currency ? String(inv.exchangeRate) : "",
          paymentMethodId: "",
          notes: data.defaultNote,
          allocations: inv && due > 0 ? [{ invoiceId: inv.id, amount: minorToInput(due) }] : [],
        }}
        paymentId={null}
        invoicesAction={openInvoicesAction}
        numberAction={suggestNumberAction.bind(null, "payment")}
        rateAction={lookupRateAction}
        customFields={data.customFields}
        cancelHref={inv ? `/invoices/${inv.id}` : "/payments"}
        lockCustomer={false}
      />
    </>
  );
}
