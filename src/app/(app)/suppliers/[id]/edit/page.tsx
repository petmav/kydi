import type { Metadata } from "next";
import { parseId } from "@/lib/auth/context";
import { SupplierFormPage } from "../../supplier-form-page";

export const metadata: Metadata = { title: "Edit supplier" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  return <SupplierFormPage id={parseId((await params).id)} />;
}
