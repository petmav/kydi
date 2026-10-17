import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { CheckboxField, Field, SelectField } from "@/components/form";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { SectionForm } from "@/components/settings/forms";
import { DeleteCompanyForm } from "@/components/settings/delete-company";
import { getCompanyContext } from "@/lib/auth/context";
import { countryOptions } from "@/lib/intl-data";
import { getCustomFields, loadCustomFieldAnswers } from "@/lib/custom-fields";
import { updateCompanyAction } from "../actions";

export const metadata: Metadata = { title: "Company information" };

export default async function CompanySettingsPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can edit company information." />;
  const c = ctx.company;
  const [fields, answers] = await Promise.all([getCustomFields(ctx.companyId, "Company"), loadCustomFieldAnswers("Company", ctx.companyId)]);
  return (
    <>
      <Card>
        <CardHeader title="Company information" description="Shown on invoices, estimates, receipts and emails." />
        <CardBody>
          <SectionForm action={updateCompanyAction}>
            <div className="flex items-center gap-4">
              {c.logoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/logo/${c.uniqueHash}`} alt={`${c.name} logo`} className="h-16 w-16 rounded-md border border-line object-contain" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-line text-xs text-muted">No logo</div>
              )}
              <div className="flex-1 space-y-2">
                <Field name="logo" label="Logo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hint="PNG, JPG, GIF or WebP up to 2 MB." />
                {c.logoPath ? <CheckboxField name="removeLogo" label="Remove current logo" /> : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="name" label="Company name" required defaultValue={c.name} className="sm:col-span-2" />
              <Field name="vatId" label="VAT ID" defaultValue={c.vatId ?? ""} />
              <Field name="taxId" label="Tax ID" defaultValue={c.taxId ?? ""} />
              <Field name="phone" label="Phone" type="tel" defaultValue={c.phone ?? ""} />
              <SelectField name="country" label="Country" required options={countryOptions()} placeholder="Select a country" defaultValue={c.country ?? ""} />
              <Field name="state" label="State / region" defaultValue={c.state ?? ""} />
              <Field name="city" label="City" defaultValue={c.city ?? ""} />
              <Field name="street1" label="Address line 1" defaultValue={c.street1 ?? ""} />
              <Field name="street2" label="Address line 2" defaultValue={c.street2 ?? ""} />
              <Field name="zip" label="ZIP / postal code" defaultValue={c.zip ?? ""} />
            </div>
            <CustomFieldInputs fields={fields} values={answers} />
          </SectionForm>
        </CardBody>
      </Card>
      <Card className="border-red-200">
        <CardHeader title="Danger zone" description="Deleting a company permanently removes all of its customers, documents, payments, expenses and settings." />
        <CardBody>
          <DeleteCompanyForm companyName={c.name} />
        </CardBody>
      </Card>
    </>
  );
}
