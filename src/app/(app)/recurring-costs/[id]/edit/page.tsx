import type { Metadata } from "next";
import { parseId } from "@/lib/auth/context";
import { RecurringCostFormPage } from "../../cost-form-page";

export const metadata: Metadata = { title: "Edit recurring cost" };

export default async function EditRecurringCostPage({ params }: { params: Promise<{ id: string }> }) {
  return <RecurringCostFormPage id={parseId((await params).id)} />;
}
