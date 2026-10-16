import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { ItemForm } from "@/components/items/item-form";
import { getCompanyContext } from "@/lib/auth/context";
import { saveUnitAction } from "../../settings/catalog-actions";
import { saveItemAction } from "../actions";
import { itemFormProps } from "../form-props";

export const metadata: Metadata = { title: "New item" };

export default async function NewItemPage() {
  const ctx = await getCompanyContext();
  if (!ctx.can("create-item")) return <Forbidden />;
  return (
    <>
      <PageHeader title="New item" back={<Link href="/items" className="text-brand-700 hover:underline focus-ring rounded">← Items</Link>} />
      <ItemForm action={saveItemAction.bind(null, null, false)} values={{}} isNew unitAction={saveUnitAction} {...await itemFormProps(ctx)} />
    </>
  );
}
