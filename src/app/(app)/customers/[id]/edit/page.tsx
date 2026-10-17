import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { CustomerForm } from "@/components/customers/customer-form";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { loadCustomFieldAnswers } from "@/lib/custom-fields";
import { customerHasActivity } from "@/server/customers";
import { saveCustomerAction } from "../../actions";
import { customerFormProps } from "../../form-props";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("edit-customer")) return <Forbidden />;
  const id = parseId((await params).id);
  const c = await db.customer.findFirst({ where: { id, companyId: ctx.companyId } });
  const hasPassword = !!(await db.customer.count({ where: { id, companyId: ctx.companyId, portalPasswordHash: { not: null } } }));
  if (!c) notFound();
  const pick = (prefix: "billing" | "shipping") => ({
    Name: c[`${prefix}Name`],
    Street1: c[`${prefix}Street1`],
    Street2: c[`${prefix}Street2`],
    City: c[`${prefix}City`],
    State: c[`${prefix}State`],
    Country: c[`${prefix}Country`],
    Zip: c[`${prefix}Zip`],
    Phone: c[`${prefix}Phone`],
  });
  return (
    <>
      <PageHeader
        title={`Edit ${c.name}`}
        back={
          <Link href={`/customers/${c.id}`} className="text-brand-700 hover:underline focus-ring rounded">
            ← {c.name}
          </Link>
        }
      />
      <CustomerForm
        action={saveCustomerAction.bind(null, c.id)}
        values={{ ...c, hasPassword, billing: pick("billing"), shipping: pick("shipping") }}
        currencyLocked={await customerHasActivity(c.id)}
        customValues={await loadCustomFieldAnswers("Customer", c.id)}
        cancelHref={`/customers/${c.id}`}
        isNew={false}
        {...await customerFormProps(ctx)}
      />
    </>
  );
}
