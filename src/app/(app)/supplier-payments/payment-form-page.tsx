import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { SupplierPaymentForm } from "@/components/purchasing/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { isoDate, todayIn } from "@/lib/dates";
import { minorToInput } from "@/lib/money";
import { lastRates, openBillOptions, supplierOptions } from "../purchases/data";
import { saveSupplierPaymentAction } from "../purchases/actions";

/** New/edit supplier payment (spec §5.9: supplier, date, amount, method, allocations to open bills). */
export async function SupplierPaymentFormPage({ id, supplierId, billId }: { id: number | null; supplierId?: number; billId?: number }) {
  const ctx = await getCompanyContext();
  if (!ctx.can(id ? "edit-supplier-payment" : "create-supplier-payment")) return <Forbidden />;
  const p = id ? await db.supplierPayment.findFirst({ where: { id, companyId: ctx.companyId, type: "PAYMENT" }, include: { settlements: true } }) : null;
  if (id && !p) notFound();
  if (p?.status === "VOID") return <Alert tone="warning">Void payments cannot be edited.</Alert>;
  const [suppliers, bills, methods, rates] = await Promise.all([
    supplierOptions(ctx.companyId),
    openBillOptions(ctx.companyId),
    db.paymentMethod.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    lastRates(ctx.companyId),
  ]);
  const refunded = p ? Number((await db.supplierPayment.aggregate({ where: { refundOfPaymentId: p.id, status: "OPEN" }, _sum: { amount: true } }))._sum.amount ?? 0) : 0;
  const bill = !p && billId ? bills.find((b) => b.id === billId) : undefined;
  const sid = p?.supplierId ?? bill?.supplierId ?? supplierId;
  const sup = suppliers.find((x) => x.id === sid);
  const existing = Object.fromEntries((p?.settlements ?? []).map((x) => [x.billId, Number(x.amount)]));
  const back = p ? `/supplier-payments/${p.id}` : "/supplier-payments";
  return (
    <>
      <PageHeader title={p ? `Edit ${p.number}` : "Record supplier payment"} back={<Link href={back} className="text-brand-700 hover:underline focus-ring rounded">← Back</Link>} />
      {suppliers.length === 0 ? (
        <Alert tone="warning" title="Add a supplier first">
          <Link href="/suppliers/new" className="underline">Create a supplier</Link> to record payments.
        </Alert>
      ) : (
        <SupplierPaymentForm
          action={saveSupplierPaymentAction.bind(null, p?.id ?? null)}
          suppliers={suppliers}
          bills={bills}
          methods={methods}
          baseCurrency={ctx.settings.currency}
          locale={ctx.settings.locale}
          rates={rates}
          existing={existing}
          refunded={refunded}
          cancelHref={back}
          initial={{
            supplierId: sid ? String(sid) : "",
            number: p?.number ?? "",
            reference: p?.reference ?? "",
            paymentDate: p ? isoDate(p.paymentDate) : todayIn(ctx.settings.time_zone),
            amount: p ? minorToInput(p.amount) : bill ? minorToInput(bill.due) : "",
            exchangeRate: String(p?.exchangeRate ?? (sup && sup.currency !== ctx.settings.currency ? (rates[sup.currency] ?? "") : 1)),
            paymentMethodId: p?.paymentMethodId ? String(p.paymentMethodId) : "",
            notes: p?.notes ?? "",
            allocations: p ? p.settlements.map((x) => ({ billId: String(x.billId), amount: minorToInput(x.amount) })) : bill ? [{ billId: String(bill.id), amount: minorToInput(bill.due) }] : [],
          }}
        />
      )}
    </>
  );
}
