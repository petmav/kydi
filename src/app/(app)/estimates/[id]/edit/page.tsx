import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { DocumentForm } from "@/components/documents/document-form";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { loadCustomFieldAnswers } from "@/lib/custom-fields";
import { documentFormData, storedDocumentInitial } from "../../../documents/form-data";
import { lookupRateAction, quickCustomerAction } from "../../../documents/actions";
import { saveItemAction } from "../../../items/actions";
import { saveEstimateAction } from "../../actions";

export const metadata: Metadata = { title: "Edit estimate" };

export default async function EditEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("edit-estimate")) return <Forbidden />;
  const id = parseId((await params).id);
  const est = await db.estimate.findFirst({ where: { id, companyId: ctx.companyId }, include: { lines: { include: { taxes: true }, orderBy: { position: "asc" } }, taxes: true } });
  if (!est) notFound();
  const data = await documentFormData(ctx, "estimate");
  return (
    <>
      <PageHeader title={`Edit ${est.estimateNumber}`} back={<Link href={`/estimates/${est.id}`} className="text-brand-700 hover:underline focus-ring rounded">← {est.estimateNumber}</Link>} />
      <DocumentForm
        kind="estimate"
        action={saveEstimateAction.bind(null, est.id)}
        customers={data.customers}
        items={data.items}
        taxTypes={data.taxTypes}
        notes={data.notes}
        company={{ ...data.company, taxPerItem: est.taxPerItem, discountPerItem: est.discountPerItem }}
        initial={storedDocumentInitial(est, { date: est.estimateDate, closingDate: est.expiryDate, number: est.estimateNumber, referenceNumber: est.referenceNumber })}
        rateAction={lookupRateAction}
        customerAction={ctx.can("create-customer") ? quickCustomerAction : undefined}
        itemAction={ctx.can("create-item") ? saveItemAction.bind(null, null, true) : undefined}
        customFields={data.customFields}
        lineFields={data.lineFields}
        customValues={await loadCustomFieldAnswers("Estimate", est.id)}
        isNew={false}
        cancelHref={`/estimates/${est.id}`}
        allowSend={false}
      />
    </>
  );
}
