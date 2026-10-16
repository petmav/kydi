import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { DocumentForm } from "@/components/documents/document-form";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { loadCustomFieldAnswers } from "@/lib/custom-fields";
import { invoiceAllowEdit } from "@/domain/status";
import { documentFormData, storedDocumentInitial } from "../../../documents/form-data";
import { lookupRateAction, quickCustomerAction } from "../../../documents/actions";
import { saveItemAction } from "../../../items/actions";
import { saveInvoiceAction } from "../../actions";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("edit-invoice")) return <Forbidden />;
  const id = parseId((await params).id);
  const inv = await db.invoice.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { lines: { include: { taxes: true }, orderBy: { position: "asc" } }, taxes: true, _count: { select: { creditNotes: true } } },
  });
  if (!inv) notFound();
  const back = <Link href={`/invoices/${inv.id}`} className="text-brand-700 hover:underline focus-ring rounded">← {inv.invoiceNumber}</Link>;
  if (inv.type === "CREDIT_NOTE" || !invoiceAllowEdit(inv.paidStatus, inv._count.creditNotes > 0, ctx.settings.retrospective_edits)) {
    return (
      <>
        <PageHeader title={`Edit ${inv.invoiceNumber}`} back={back} />
        <Alert tone="warning" title="This invoice can no longer be edited">
          It has credit notes, is a credit note itself, or the company&apos;s retrospective-edit policy locks it after payment.
        </Alert>
      </>
    );
  }
  const data = await documentFormData(ctx, "invoice");
  const company = { ...data.company, taxPerItem: inv.taxPerItem, discountPerItem: inv.discountPerItem };
  return (
    <>
      <PageHeader title={`Edit ${inv.invoiceNumber}`} back={back} />
      <DocumentForm
        kind="invoice"
        action={saveInvoiceAction.bind(null, inv.id)}
        customers={data.customers}
        items={data.items}
        taxTypes={data.taxTypes}
        notes={data.notes}
        company={company}
        initial={storedDocumentInitial(inv, { date: inv.invoiceDate, time: inv.invoiceTime, closingDate: inv.dueDate, number: inv.invoiceNumber, referenceNumber: inv.referenceNumber })}
        rateAction={lookupRateAction}
        customerAction={ctx.can("create-customer") ? quickCustomerAction : undefined}
        itemAction={ctx.can("create-item") ? saveItemAction.bind(null, null, true) : undefined}
        customFields={data.customFields}
        lineFields={data.lineFields}
        useTime={data.useTime}
        customValues={await loadCustomFieldAnswers("Invoice", inv.id)}
        isNew={false}
        cancelHref={`/invoices/${inv.id}`}
        allowSend={false}
      />
    </>
  );
}
