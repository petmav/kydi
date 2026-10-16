import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { DocumentForm } from "@/components/documents/document-form";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { isoDate, zonedParts } from "@/lib/dates";
import { loadCustomFieldAnswers, type CfModel } from "@/lib/custom-fields";
import { documentFormData, storedDocumentInitial } from "../../../documents/form-data";
import { lookupRateAction, previewScheduleAction, quickCustomerAction } from "../../../documents/actions";
import { saveItemAction } from "../../../items/actions";
import { saveRecurringAction } from "../../actions";

export const metadata: Metadata = { title: "Edit recurring invoice" };

export default async function EditRecurringPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("edit-recurring-invoice")) return <Forbidden />;
  const id = parseId((await params).id);
  const r = await db.recurringInvoice.findFirst({ where: { id, companyId: ctx.companyId }, include: { lines: { include: { taxes: true }, orderBy: { position: "asc" } }, taxes: true } });
  if (!r) notFound();
  const data = await documentFormData(ctx, "recurring");
  const p = zonedParts(r.startsAt, ctx.settings.time_zone);
  const start = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const initial = {
    ...storedDocumentInitial(r, { date: null, closingDate: null, number: "", referenceNumber: null }),
    recurring: {
      startsAt: start,
      frequency: r.frequency,
      limitBy: r.limitBy,
      limitCount: r.limitCount ? String(r.limitCount) : "",
      limitDate: r.limitDate ? isoDate(r.limitDate) : "",
      status: r.status,
      sendAutomatically: r.sendAutomatically,
      notifyCreator: r.notifyCreator,
    },
  };
  return (
    <>
      <PageHeader title="Edit recurring invoice" back={<Link href={`/recurring-invoices/${r.id}`} className="text-brand-700 hover:underline focus-ring rounded">← Schedule</Link>} />
      <DocumentForm
        kind="recurring"
        action={saveRecurringAction.bind(null, r.id)}
        customers={data.customers}
        items={data.items}
        taxTypes={data.taxTypes}
        notes={data.notes}
        company={{ ...data.company, taxPerItem: r.taxPerItem, discountPerItem: r.discountPerItem }}
        initial={initial}
        rateAction={lookupRateAction}
        previewAction={previewScheduleAction}
        customerAction={ctx.can("create-customer") ? quickCustomerAction : undefined}
        itemAction={ctx.can("create-item") ? saveItemAction.bind(null, null, true) : undefined}
        customFields={data.customFields}
        lineFields={data.lineFields}
        customValues={await loadCustomFieldAnswers("RecurringInvoice" as CfModel, r.id)}
        isNew={false}
        cancelHref={`/recurring-invoices/${r.id}`}
        allowSend={false}
      />
    </>
  );
}
