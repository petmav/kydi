import type { Metadata } from "next";
import { RecurringCostFormPage } from "../cost-form-page";

export const metadata: Metadata = { title: "New recurring cost" };

export default function NewRecurringCostPage() {
  return <RecurringCostFormPage id={null} />;
}
