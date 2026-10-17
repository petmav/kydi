import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { SupplierForm, type SupplierValues } from "@/components/purchasing/supplier-form";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { countryOptions, currencyOptions } from "@/lib/intl-data";
import { supplierHasDocuments } from "@/server/purchasing";
import { categoryOptions } from "../purchases/data";
import { saveSupplierAction } from "../purchases/actions";

/** Shared by /suppliers/new and /suppliers/[id]/edit. */
export async function SupplierFormPage({ id }: { id: number | null }) {
  const ctx = await getCompanyContext();
  if (!ctx.can(id ? "edit-supplier" : "create-supplier")) return <Forbidden />;
  const s = id ? await db.supplier.findFirst({ where: { id, companyId: ctx.companyId } }) : null;
  if (id && !s) notFound();
  const values: SupplierValues = {
    name: s?.name ?? "",
    contactName: s?.contactName ?? "",
    email: s?.email ?? "",
    phone: s?.phone ?? "",
    website: s?.website ?? "",
    taxId: s?.taxId ?? "",
    currency: s?.currency ?? ctx.settings.currency,
    expenseCategoryId: s?.expenseCategoryId ? String(s.expenseCategoryId) : "",
    paymentTerms: String(s?.paymentTerms ?? 30),
    street1: s?.street1 ?? "",
    street2: s?.street2 ?? "",
    city: s?.city ?? "",
    state: s?.state ?? "",
    zip: s?.zip ?? "",
    country: s?.country ?? "",
    notes: s?.notes ?? "",
    enabled: s?.enabled ?? true,
  };
  const cats = await categoryOptions(ctx.companyId);
  const back = s ? `/suppliers/${s.id}` : "/suppliers";
  return (
    <>
      <PageHeader title={s ? `Edit ${s.name}` : "New supplier"} back={<Link href={back} className="text-brand-700 hover:underline focus-ring rounded">← Back</Link>} />
      <SupplierForm
        action={saveSupplierAction.bind(null, s?.id ?? null)}
        values={values}
        currencies={currencyOptions()}
        countries={countryOptions()}
        categories={cats.map((c) => ({ value: String(c.id), label: c.name }))}
        currencyLocked={s ? await supplierHasDocuments(s.id) : false}
        isEdit={!!s}
        cancelHref={back}
      />
    </>
  );
}
