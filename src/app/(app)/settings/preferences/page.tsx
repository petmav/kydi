import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { CheckboxField, Field, SelectField } from "@/components/form";
import { SectionForm } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { currencyOptions, DATE_FORMATS, LOCALES, timezoneOptions } from "@/lib/intl-data";
import { FISCAL_YEARS } from "@/lib/settings";
import { companyHasFinancialData } from "@/lib/companies";
import { updatePreferencesAction } from "../actions";

export const metadata: Metadata = { title: "Preferences" };

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "el", label: "Ελληνικά" },
];

export default async function PreferencesPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can change preferences." />;
  const s = ctx.settings;
  const locked = await companyHasFinancialData(ctx.companyId);
  return (
    <Card>
      <CardHeader title="Preferences" description="Currency, regional formats and document behaviour." />
      <CardBody>
        <SectionForm action={updatePreferencesAction}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="currency"
              label="Currency"
              required
              options={currencyOptions()}
              defaultValue={s.currency}
              disabled={locked}
              hint={locked ? "Locked because documents or payments already exist." : "Base currency for reports and the dashboard."}
            />
            <SelectField name="language" label="Default language" required options={LANGUAGES} defaultValue={s.language} hint="Language for PDFs and emails." />
            <SelectField name="time_zone" label="Time zone" required options={timezoneOptions()} defaultValue={s.time_zone} />
            <SelectField name="locale" label="Number format" required options={[...LOCALES]} defaultValue={s.locale} />
            <SelectField name="date_format" label="Date format" required options={[...DATE_FORMATS]} defaultValue={s.date_format} />
            <SelectField name="fiscal_year" label="Financial year" required options={FISCAL_YEARS} defaultValue={s.fiscal_year} />
          </div>
          <div className="space-y-3 border-t border-line pt-4">
            <CheckboxField
              name="discount_per_item"
              label="Discount per item"
              hint="Each line gets its own discount instead of one document discount."
              defaultChecked={s.discount_per_item === "YES"}
            />
            <CheckboxField
              name="invoice_use_time"
              label="Invoice use time"
              hint="Invoice dates carry a time of day and print with it."
              defaultChecked={s.invoice_use_time === "YES"}
            />
            <CheckboxField
              name="automatically_expire_public_links"
              label="Automatically expire public links"
              hint="Links in emailed documents stop working after the number of days below."
              defaultChecked={s.automatically_expire_public_links === "YES"}
            />
            <Field name="link_expiry_days" label="Link expiry (days)" type="number" min="1" max="365" defaultValue={s.link_expiry_days} className="max-w-xs" />
          </div>
        </SectionForm>
      </CardBody>
    </Card>
  );
}
