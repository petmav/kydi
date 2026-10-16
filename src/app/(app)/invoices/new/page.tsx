import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { DocumentForm } from "@/components/documents/document-form";
import { getCompanyContext } from "@/lib/auth/context";
import type { SearchParams } from "@/lib/list";
import { documentFormData, newDocumentInitial } from "../../documents/form-data";
import { lookupRateAction, quickCustomerAction, suggestNumberAction } from "../../documents/actions";
import { saveItemAction } from "../../items/actions";
import { saveInvoiceAction } from "../actions";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("create-invoice")) return <Forbidden />;
  const sp = await searchParams;
  const data = await documentFormData(ctx, "invoice");
  const initial = newDocumentInitial(data, ctx, "invoice", Number(sp.customer) || null);
  return (
    <>
      <PageHeader title="New invoice" back={<Link href="/invoices" className="text-brand-700 hover:underline focus-ring rounded">← Invoices</Link>} />
      <DocumentForm
        kind="invoice"
        action={saveInvoiceAction.bind(null, null)}
        customers={data.customers}
        items={data.items}
        taxTypes={data.taxTypes}
        notes={data.notes}
        company={data.company}
        initial={initial}
        numberAction={suggestNumberAction.bind(null, "invoice")}
        rateAction={lookupRateAction}
        customerAction={ctx.can("create-customer") ? quickCustomerAction : undefined}
        itemAction={ctx.can("create-item") ? saveItemAction.bind(null, null, true) : undefined}
        customFields={data.customFields}
        isNew
        cancelHref="/invoices"
        allowSend={ctx.can("send-invoice")}
      />
    </>
  );
}
