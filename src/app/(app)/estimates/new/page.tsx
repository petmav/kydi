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
import { saveEstimateAction } from "../actions";

export const metadata: Metadata = { title: "New estimate" };

export default async function NewEstimatePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("create-estimate")) return <Forbidden />;
  const sp = await searchParams;
  const data = await documentFormData(ctx, "estimate");
  return (
    <>
      <PageHeader title="New estimate" back={<Link href="/estimates" className="text-brand-700 hover:underline focus-ring rounded">← Estimates</Link>} />
      <DocumentForm
        kind="estimate"
        action={saveEstimateAction.bind(null, null)}
        customers={data.customers}
        items={data.items}
        taxTypes={data.taxTypes}
        notes={data.notes}
        company={data.company}
        initial={newDocumentInitial(data, ctx, "estimate", Number(sp.customer) || null)}
        numberAction={suggestNumberAction.bind(null, "estimate")}
        rateAction={lookupRateAction}
        customerAction={ctx.can("create-customer") ? quickCustomerAction : undefined}
        itemAction={ctx.can("create-item") ? saveItemAction.bind(null, null, true) : undefined}
        customFields={data.customFields}
        lineFields={data.lineFields}
        isNew
        cancelHref="/estimates"
        allowSend={ctx.can("send-estimate")}
      />
    </>
  );
}
