import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { DocumentForm } from "@/components/documents/document-form";
import { getCompanyContext } from "@/lib/auth/context";
import type { SearchParams } from "@/lib/list";
import { documentFormData, newDocumentInitial } from "../../documents/form-data";
import { lookupRateAction, previewScheduleAction, quickCustomerAction } from "../../documents/actions";
import { saveItemAction } from "../../items/actions";
import { saveRecurringAction } from "../actions";

export const metadata: Metadata = { title: "New recurring invoice" };

export default async function NewRecurringPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("create-recurring-invoice")) return <Forbidden />;
  const sp = await searchParams;
  const data = await documentFormData(ctx, "recurring");
  return (
    <>
      <PageHeader title="New recurring invoice" back={<Link href="/recurring-invoices" className="text-brand-700 hover:underline focus-ring rounded">← Recurring invoices</Link>} />
      <DocumentForm
        kind="recurring"
        action={saveRecurringAction.bind(null, null)}
        customers={data.customers}
        items={data.items}
        taxTypes={data.taxTypes}
        notes={data.notes}
        company={data.company}
        initial={newDocumentInitial(data, ctx, "recurring", Number(sp.customer) || null)}
        rateAction={lookupRateAction}
        previewAction={previewScheduleAction}
        customerAction={ctx.can("create-customer") ? quickCustomerAction : undefined}
        itemAction={ctx.can("create-item") ? saveItemAction.bind(null, null, true) : undefined}
        customFields={data.customFields}
        lineFields={data.lineFields}
        isNew
        cancelHref="/recurring-invoices"
        allowSend={false}
      />
    </>
  );
}
