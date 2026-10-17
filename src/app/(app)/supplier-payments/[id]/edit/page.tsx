import type { Metadata } from "next";
import { parseId } from "@/lib/auth/context";
import { SupplierPaymentFormPage } from "../../payment-form-page";

export const metadata: Metadata = { title: "Edit supplier payment" };

export default async function EditSupplierPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  return <SupplierPaymentFormPage id={parseId((await params).id)} />;
}
