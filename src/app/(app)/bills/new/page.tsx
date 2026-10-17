import type { Metadata } from "next";
import type { SearchParams } from "@/lib/list";
import { BillFormPage } from "../bill-form-page";

export const metadata: Metadata = { title: "New bill" };

export default async function NewBillPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  return <BillFormPage id={null} type={one("type") === "credit" ? "SUPPLIER_CREDIT" : "BILL"} supplierId={Number(one("supplier")) || undefined} fromBill={Number(one("from")) || undefined} />;
}
