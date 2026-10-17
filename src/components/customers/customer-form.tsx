"use client";

import { useRef, useState } from "react";
import { Copy } from "lucide-react";
import { CheckboxField, Field, Form, SelectField, SubmitButton, type FormAction, type Option } from "@/components/form";
import { CustomFieldInputs, type CustomFieldInputDef } from "@/components/custom-field-inputs";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import { toast } from "@/components/toast";

type Address = Partial<Record<"Name" | "Street1" | "Street2" | "City" | "State" | "Country" | "Zip" | "Phone", string | null>>;

export type CustomerFormValues = {
  name?: string;
  contactName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  prefix?: string | null;
  taxId?: string | null;
  currency?: string;
  enablePortal?: boolean;
  hasPassword?: boolean;
  billing?: Address;
  shipping?: Address;
};

function AddressFields({ prefix, values, countries, formRef }: { prefix: "billing" | "shipping"; values?: Address; countries: Option[]; formRef?: React.RefObject<HTMLFormElement | null> }) {
  void formRef;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name={`${prefix}Name`} label="Name" defaultValue={values?.Name ?? ""} maxLength={255} />
      <SelectField name={`${prefix}Country`} label="Country" options={countries} placeholder="Select a country" defaultValue={values?.Country ?? ""} />
      <Field name={`${prefix}State`} label="State" defaultValue={values?.State ?? ""} maxLength={255} />
      <Field name={`${prefix}City`} label="City" defaultValue={values?.City ?? ""} maxLength={255} />
      <Field name={`${prefix}Street1`} label="Address line 1" defaultValue={values?.Street1 ?? ""} maxLength={255} />
      <Field name={`${prefix}Street2`} label="Address line 2" defaultValue={values?.Street2 ?? ""} maxLength={255} />
      <Field name={`${prefix}Phone`} label="Phone" type="tel" defaultValue={values?.Phone ?? ""} maxLength={255} />
      <Field name={`${prefix}Zip`} label="ZIP / postal code" defaultValue={values?.Zip ?? ""} maxLength={255} />
    </div>
  );
}

export function CustomerForm({
  action,
  values,
  currencies,
  countries,
  currencyLocked,
  portalUrl,
  customFields,
  customValues,
  cancelHref,
  isNew,
}: {
  action: FormAction;
  values: CustomerFormValues;
  currencies: Option[];
  countries: Option[];
  currencyLocked: boolean;
  portalUrl: string;
  customFields: CustomFieldInputDef[];
  customValues?: Record<number, string | null>;
  cancelHref: string;
  isNew: boolean;
}) {
  const [portal, setPortal] = useState(values.enablePortal ?? false);
  const [shippingKey, setShippingKey] = useState(0);
  const [shippingValues, setShippingValues] = useState<Address | undefined>(values.shipping);
  const formWrap = useRef<HTMLDivElement>(null);

  const copyBilling = () => {
    const form = formWrap.current?.querySelector("form");
    if (!form) return;
    const fd = new FormData(form);
    const next: Address = {};
    for (const k of ["Name", "Street1", "Street2", "City", "State", "Country", "Zip", "Phone"] as const) next[k] = String(fd.get(`billing${k}`) ?? "");
    setShippingValues(next);
    setShippingKey((k) => k + 1);
  };

  return (
    <div ref={formWrap}>
      <Form action={action} className="space-y-6">
        <Card>
          <CardHeader title="Basic information" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field name="name" label="Display name" required defaultValue={values.name} autoFocus={isNew} maxLength={255} />
            <Field name="contactName" label="Primary contact name" defaultValue={values.contactName ?? ""} />
            <Field name="email" label="Email" type="email" defaultValue={values.email ?? ""} />
            <Field name="phone" label="Phone" type="tel" defaultValue={values.phone ?? ""} />
            <Field name="companyName" label="Company name" defaultValue={values.companyName ?? ""} />
            <SelectField
              name="currency"
              label="Primary currency"
              required
              options={currencies}
              defaultValue={values.currency}
              disabled={currencyLocked}
              hint={currencyLocked ? "Locked: this customer already has documents or payments." : "All documents for this customer use this currency."}
            />
            {currencyLocked ? <input type="hidden" name="currency" value={values.currency} /> : null}
            <Field name="website" label="Website" type="url" placeholder="https://" defaultValue={values.website ?? ""} />
            <Field name="prefix" label="Prefix" hint="Customer series used by {{CUSTOMER_SERIES}} numbering." defaultValue={values.prefix ?? ""} maxLength={10} />
            <Field name="taxId" label="Tax ID" defaultValue={values.taxId ?? ""} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Portal access" description="Let this customer sign in to view their invoices, estimates and payments." />
          <CardBody className="space-y-4">
            <CheckboxField name="enablePortal" label="Enable portal" checked={portal} onChange={(e) => setPortal(e.target.checked)} />
            {portal ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    name="password"
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                    hint={values.hasPassword ? "Leave blank to keep the current password." : "Optional. Leave blank and the customer chooses their own password from the setup email sent with their first invoice, or with “Forgot password?”."}
                  />
                  <Field name="confirm" label="Confirm password" type="password" autoComplete="new-password" />
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-subtle px-3 py-2 text-sm">
                  <span className="text-muted">Portal login URL:</span>
                  <code className="break-all text-xs">{portalUrl}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await navigator.clipboard.writeText(portalUrl);
                      toast("Portal URL copied.");
                    }}
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" /> Copy
                  </Button>
                </div>
              </>
            ) : null}
          </CardBody>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Billing address" />
            <CardBody>
              <AddressFields prefix="billing" values={values.billing} countries={countries} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Shipping address"
              actions={
                <Button size="sm" variant="secondary" onClick={copyBilling}>
                  Copy from billing
                </Button>
              }
            />
            <CardBody key={shippingKey}>
              <AddressFields prefix="shipping" values={shippingValues} countries={countries} />
            </CardBody>
          </Card>
        </div>

        {customFields.length > 0 ? (
          <Card>
            <CardHeader title="Additional information" />
            <CardBody>
              <CustomFieldInputs fields={customFields} values={customValues} isNew={isNew} />
            </CardBody>
          </Card>
        ) : null}

        <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-line bg-white px-4 py-3 sm:mx-0 sm:rounded-md sm:border">
          <ButtonLink href={cancelHref} variant="secondary">
            Cancel
          </ButtonLink>
          <SubmitButton pendingLabel="Saving…">{isNew ? "Save customer" : "Update customer"}</SubmitButton>
        </div>
      </Form>
    </div>
  );
}
