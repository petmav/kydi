import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { Field, Form, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { formatMoney, minorToInput } from "@/lib/money";
import type { SearchParams } from "@/lib/list";
import { refundableBalance } from "@/server/purchasing";
import { lastRates } from "../../../purchases/data";
import { saveRefundAction } from "../../../purchases/actions";

export const metadata: Metadata = { title: "Record supplier refund" };

/** Spec §4.14: money returned by a supplier against a payment or a credit, up to its remaining balance. */
export default async function NewRefundPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("create-supplier-refund")) return <Forbidden />;
  const sp = await searchParams;
  const pre = typeof sp.source === "string" ? sp.source : "";
  const [payments, credits, methods, rates] = await Promise.all([
    db.supplierPayment.findMany({ where: { companyId: ctx.companyId, type: "PAYMENT", status: "OPEN" }, select: { id: true }, orderBy: { paymentDate: "desc" }, take: 200 }),
    db.bill.findMany({ where: { companyId: ctx.companyId, type: "SUPPLIER_CREDIT", status: "OPEN" }, select: { id: true }, orderBy: { documentDate: "desc" }, take: 200 }),
    db.paymentMethod.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
    lastRates(ctx.companyId),
  ]);
  const suppliers = new Map((await db.supplier.findMany({ where: { companyId: ctx.companyId }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  const options: { value: string; label: string; remaining: number; currency: string }[] = [];
  for (const p of payments) {
    const b = await refundableBalance(ctx.companyId, "payment", p.id);
    if (b && b.remaining > 0) options.push({ value: `payment:${p.id}`, label: `Payment ${b.label} · ${suppliers.get(b.supplierId)} · ${formatMoney(b.remaining, b.currency, ctx.settings.locale)} available`, remaining: b.remaining, currency: b.currency });
  }
  for (const c of credits) {
    const b = await refundableBalance(ctx.companyId, "credit", c.id);
    if (b && b.remaining > 0) options.push({ value: `credit:${c.id}`, label: `Credit ${b.label} · ${suppliers.get(b.supplierId)} · ${formatMoney(b.remaining, b.currency, ctx.settings.locale)} available`, remaining: b.remaining, currency: b.currency });
  }
  const selected = options.find((o) => o.value === pre);
  const foreign = selected && selected.currency !== ctx.settings.currency;
  return (
    <>
      <PageHeader title="Record supplier refund" back={<Link href="/supplier-payments?tab=refunds" className="text-brand-700 hover:underline focus-ring rounded">← Refunds</Link>} />
      {options.length === 0 ? (
        <Alert tone="info">There is nothing to refund: no open supplier payment or credit has an unallocated balance.</Alert>
      ) : (
        <Card className="max-w-2xl">
          <CardBody>
            <Form action={saveRefundAction} className="space-y-4" showErrorSummary>
              <SelectField name="source" label="Refund of" required options={options.map(({ value, label }) => ({ value, label }))} placeholder="Choose a payment or credit" defaultValue={pre} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="paymentDate" label="Refund date" type="date" required defaultValue={todayIn(ctx.settings.time_zone)} />
                <Field name="amount" label="Amount" required inputMode="decimal" defaultValue={selected ? minorToInput(selected.remaining) : ""} hint="In the currency of the payment or credit." />
                <Field name="exchangeRate" label={`Exchange rate (to ${ctx.settings.currency})`} defaultValue={selected ? String(foreign ? (rates[selected.currency] ?? "") : 1) : "1"} hint="Only used for foreign-currency suppliers." />
                <SelectField name="paymentMethodId" label="Payment mode" options={methods.map((m) => ({ value: String(m.id), label: m.name }))} placeholder="None" />
                <Field name="number" label="Refund number" hint="Leave blank to use the next number." />
                <Field name="reference" label="Reference" />
              </div>
              <TextareaField name="notes" label="Notes" />
              <div className="flex justify-end">
                <SubmitButton pendingLabel="Saving…">Save refund</SubmitButton>
              </div>
            </Form>
          </CardBody>
        </Card>
      )}
    </>
  );
}
