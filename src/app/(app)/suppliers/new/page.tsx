import type { Metadata } from "next";
import { SupplierFormPage } from "../supplier-form-page";

export const metadata: Metadata = { title: "New supplier" };

export default function NewSupplierPage() {
  return <SupplierFormPage id={null} />;
}
