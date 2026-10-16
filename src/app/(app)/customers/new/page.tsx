import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { CustomerForm } from "@/components/customers/customer-form";
import { getCompanyContext } from "@/lib/auth/context";
import { saveCustomerAction } from "../actions";
import { customerFormProps } from "../form-props";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  const ctx = await getCompanyContext();
  if (!ctx.can("create-customer")) return <Forbidden />;
  return (
    <>
      <PageHeader
        title="New customer"
        back={
          <Link href="/customers" className="text-brand-700 hover:underline focus-ring rounded">
            ← Customers
          </Link>
        }
      />
      <CustomerForm
        action={saveCustomerAction.bind(null, null)}
        values={{ currency: ctx.settings.currency }}
        currencyLocked={false}
        cancelHref="/customers"
        isNew
        {...await customerFormProps(ctx)}
      />
    </>
  );
}
