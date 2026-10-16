"use client";

import { Field, Form, SelectField, SubmitButton, type FormAction, type Option } from "@/components/form";

export function CompanyForm({
  action,
  currencies,
  countries,
  timezones,
  dateFormats,
  locales,
  months,
  submitLabel,
}: {
  action: FormAction;
  currencies: Option[];
  countries: Option[];
  timezones: Option[];
  dateFormats: Option[];
  locales: Option[];
  months: Option[];
  submitLabel: string;
}) {
  const guessedTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  return (
    <Form action={action} className="space-y-4" showErrorSummary>
      <Field name="name" label="Company name" required autoFocus autoComplete="organization" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="currency" label="Currency" required options={currencies} defaultValue="USD" />
        <SelectField name="country" label="Country" options={countries} placeholder="Select a country" defaultValue="" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="timezone"
          label="Time zone"
          required
          options={timezones}
          defaultValue={timezones.some((t) => t.value === guessedTz) ? guessedTz : "UTC"}
        />
        <SelectField name="locale" label="Number format" required options={locales} defaultValue="en-US" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="dateFormat" label="Date format" required options={dateFormats} defaultValue="yyyy-MM-dd" />
        <SelectField name="fiscalYearStartMonth" label="Fiscal year starts" required options={months} defaultValue="1" />
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating…">
        {submitLabel}
      </SubmitButton>
    </Form>
  );
}
