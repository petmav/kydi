"use client";

import { CheckboxField, Field, Form, SelectField, SubmitButton, TextareaField, type FormAction, type Option } from "@/components/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";

export type SupplierValues = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  taxId: string;
  currency: string;
  expenseCategoryId: string;
  paymentTerms: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  notes: string;
  enabled: boolean;
};

/** Supplier form (spec §3.20 fields). */
export function SupplierForm({
  action,
  values,
  currencies,
  countries,
  categories,
  currencyLocked,
  isEdit,
  cancelHref,
}: {
  action: FormAction;
  values: SupplierValues;
  currencies: Option[];
  countries: Option[];
  categories: Option[];
  currencyLocked: boolean;
  isEdit: boolean;
  cancelHref: string;
}) {
  return (
    <Form action={action} className="space-y-6" showErrorSummary>
      <Card>
        <CardHeader title="Basic information" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Name" required defaultValue={values.name} autoFocus />
          <Field name="contactName" label="Contact name" defaultValue={values.contactName} />
          <Field name="email" label="Email" type="email" defaultValue={values.email} />
          <Field name="phone" label="Phone" type="tel" defaultValue={values.phone} />
          <Field name="website" label="Website" defaultValue={values.website} placeholder="https://" />
          <Field name="taxId" label="Tax ID" defaultValue={values.taxId} />
          <SelectField
            name="currency"
            label="Currency"
            required
            options={currencies}
            defaultValue={values.currency}
            disabled={currencyLocked}
            hint={currencyLocked ? "Locked because the supplier has documents." : undefined}
          />
          {currencyLocked ? <input type="hidden" name="currency" value={values.currency} /> : null}
          <SelectField name="expenseCategoryId" label="Default category" options={categories} placeholder="None" defaultValue={values.expenseCategoryId} hint="Pre-selected on new bill lines." />
          <Field name="paymentTerms" label="Payment terms (days)" type="number" min="0" max="365" defaultValue={values.paymentTerms} hint="Bill due date = bill date + terms." />
          {isEdit ? <CheckboxField name="enabled" label="Enabled" hint="Disabled suppliers cannot receive new bills or payments." defaultChecked={values.enabled} className="self-end" /> : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Address" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field name="street1" label="Address line 1" defaultValue={values.street1} />
          <Field name="street2" label="Address line 2" defaultValue={values.street2} />
          <Field name="city" label="City" defaultValue={values.city} />
          <Field name="state" label="State / region" defaultValue={values.state} />
          <Field name="zip" label="ZIP / postal code" defaultValue={values.zip} />
          <SelectField name="country" label="Country" options={countries} placeholder="Select a country" defaultValue={values.country} />
          <TextareaField name="notes" label="Notes" defaultValue={values.notes} className="sm:col-span-2" />
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingLabel="Saving…">{isEdit ? "Save supplier" : "Create supplier"}</SubmitButton>
      </div>
    </Form>
  );
}
