import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { ItemForm } from "@/components/items/item-form";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { minorToInput } from "@/lib/money";
import { loadCustomFieldAnswers } from "@/lib/custom-fields";
import { saveUnitAction } from "../../../settings/catalog-actions";
import { saveItemAction } from "../../actions";
import { itemFormProps } from "../../form-props";

export const metadata: Metadata = { title: "Edit item" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("edit-item")) return <Forbidden />;
  const id = parseId((await params).id);
  const item = await db.item.findFirst({ where: { id, companyId: ctx.companyId }, include: { taxes: true } });
  if (!item) notFound();
  return (
    <>
      <PageHeader title={`Edit ${item.name}`} back={<Link href="/items" className="text-brand-700 hover:underline focus-ring rounded">← Items</Link>} />
      <ItemForm
        action={saveItemAction.bind(null, item.id, false)}
        values={{ name: item.name, price: minorToInput(item.price), unitId: item.unitId, description: item.description, taxIds: item.taxes.map((t) => t.taxTypeId) }}
        customValues={await loadCustomFieldAnswers("Item", item.id)}
        isNew={false}
        unitAction={saveUnitAction}
        {...await itemFormProps(ctx)}
      />
    </>
  );
}
