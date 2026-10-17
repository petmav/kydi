import type { Metadata } from "next";
import { parseId } from "@/lib/auth/context";
import { BillFormPage } from "../../bill-form-page";

export const metadata: Metadata = { title: "Edit bill" };

export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  return <BillFormPage id={parseId((await params).id)} type="BILL" />;
}
