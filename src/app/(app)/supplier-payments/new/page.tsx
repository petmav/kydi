import type { Metadata } from "next";
import type { SearchParams } from "@/lib/list";
import { SupplierPaymentFormPage } from "../payment-form-page";

export const metadata: Metadata = { title: "Record supplier payment" };

export default async function NewSupplierPaymentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? Number(sp[k]) || undefined : undefined);
  return <SupplierPaymentFormPage id={null} supplierId={one("supplier")} billId={one("bill")} />;
}
