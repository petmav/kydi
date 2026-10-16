import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/context";
import { CompanyForm } from "@/components/company-form";
import { countryOptions, currencyOptions, DATE_FORMATS, LOCALES, timezoneOptions } from "@/lib/intl-data";
import { FISCAL_YEARS } from "@/lib/settings";
import { createCompanyAction } from "../actions";
import { InstallSteps } from "../steps";

export const metadata: Metadata = { title: "Company profile" };

export default async function InstallCompanyPage() {
  const user = await requireUser();
  if ((await db.companyUser.count({ where: { userId: user.id } })) > 0) redirect("/dashboard");
  return (
    <>
      <InstallSteps current={2} />
      <h1 className="text-xl font-semibold">Tell us about your company</h1>
      <p className="mt-1 text-sm text-muted">
        These defaults drive invoice numbering, currency formatting and dates. You can change them later in Settings.
      </p>
      <div className="mt-6">
        <CompanyForm
          action={createCompanyAction}
          currencies={currencyOptions()}
          countries={countryOptions()}
          timezones={timezoneOptions()}
          dateFormats={[...DATE_FORMATS]}
          locales={[...LOCALES]}
          months={FISCAL_YEARS}
          submitLabel="Finish setup"
        />
      </div>
    </>
  );
}
