import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { BillForm, type LineState } from "@/components/purchasing/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { isoDate, todayIn } from "@/lib/dates";
import { minorToInput } from "@/lib/money";
import { categoryOptions, lastRates, purchaseTaxOptions, supplierOptions } from "../purchases/data";
import { saveBillAction } from "../purchases/actions";

/** New/edit page for bills and supplier credits (spec §5.9). `fromBill` prefills a credit from a bill's lines. */
export async function BillFormPage({ id, type, supplierId, fromBill }: { id: number | null; type: "BILL" | "SUPPLIER_CREDIT"; supplierId?: number; fromBill?: number }) {
  const ctx = await getCompanyContext();
  const existing = id ? await db.bill.findFirst({ where: { id, companyId: ctx.companyId }, include: { lines: { include: { taxes: true }, orderBy: { position: "asc" } } } }) : null;
  if (id && !existing) notFound();
  const docType = existing?.type ?? type;
  const credit = docType === "SUPPLIER_CREDIT";
  if (!ctx.can(credit ? (id ? "edit-supplier-credit" : "create-supplier-credit") : id ? "edit-bill" : "create-bill")) return <Forbidden />;
  if (existing?.status === "VOID") return <Alert tone="warning">Void documents cannot be edited.</Alert>;

  const source = !existing && credit && fromBill ? await db.bill.findFirst({ where: { id: fromBill, companyId: ctx.companyId, type: "BILL" }, include: { lines: { include: { taxes: true }, orderBy: { position: "asc" } } } }) : null;
  const [suppliers, categories, taxes, rates] = await Promise.all([supplierOptions(ctx.companyId), categoryOptions(ctx.companyId), purchaseTaxOptions(ctx.companyId), lastRates(ctx.companyId)]);
  const linesFrom = (doc: NonNullable<typeof existing>): LineState[] =>
    doc.lines.map((l) => ({
      expenseCategoryId: String(l.expenseCategoryId),
      description: l.description,
      quantity: String(l.quantity),
      price: minorToInput(l.price),
      discountType: l.discountType,
      discount: l.discountType === "FIXED" ? String(l.discount) : String(l.discount),
      taxTypeIds: l.taxes.map((t) => t.taxTypeId).filter((x): x is number => x !== null),
      sourceBillLineId: doc === source ? l.id : l.sourceBillLineId,
    }));
  const preSupplier = existing?.supplierId ?? source?.supplierId ?? supplierId;
  const sup = suppliers.find((x) => x.id === preSupplier);
  const today = todayIn(ctx.settings.time_zone);
  const initial = {
    supplierId: preSupplier ? String(preSupplier) : "",
    number: existing?.number ?? "",
    reference: existing?.reference ?? (source ? `Credit for ${source.number}` : ""),
    documentDate: existing ? isoDate(existing.documentDate) : today,
    dueDate: existing?.dueDate ? isoDate(existing.dueDate) : "",
    exchangeRate: String(existing?.exchangeRate ?? source?.exchangeRate ?? (sup && sup.currency !== ctx.settings.currency ? (rates[sup.currency] ?? "") : 1)),
    taxIncluded: existing?.taxIncluded ?? source?.taxIncluded ?? false,
    notes: existing?.notes ?? "",
    sourceBillId: existing?.sourceBillId ?? source?.id ?? null,
    lines: existing ? linesFrom(existing) : source ? linesFrom(source) : [{ expenseCategoryId: sup?.expenseCategoryId ? String(sup.expenseCategoryId) : "", description: "", quantity: "1", price: "", discountType: "PERCENTAGE" as const, discount: "0", taxTypeIds: [] }],
  };
  const back = existing ? `/bills/${existing.id}` : credit ? "/bills?tab=credits" : "/bills";
  const title = existing ? `Edit ${existing.number}` : credit ? (source ? `Credit for ${source.number}` : "New supplier credit") : "New bill";
  return (
    <>
      <PageHeader title={title} back={<Link href={back} className="text-brand-700 hover:underline focus-ring rounded">← Back</Link>} />
      {categories.length === 0 ? (
        <Alert tone="warning" title="Add an expense category first">
          Bill lines need a category. Create one under Settings &gt; Expense categories.
        </Alert>
      ) : suppliers.length === 0 ? (
        <Alert tone="warning" title="Add a supplier first">
          <Link href="/suppliers/new" className="underline">
            Create a supplier
          </Link>{" "}
          to record bills.
        </Alert>
      ) : (
        <BillForm
          type={docType}
          action={saveBillAction.bind(null, existing?.id ?? null)}
          suppliers={suppliers}
          categories={categories}
          taxes={taxes}
          baseCurrency={ctx.settings.currency}
          locale={ctx.settings.locale}
          rates={rates}
          initial={initial}
          locked={!!existing?.financialLockedAt}
          status={existing ? (existing.status === "DRAFT" ? "DRAFT" : "OPEN") : "NEW"}
          cancelHref={back}
        />
      )}
    </>
  );
}
