import type { Metadata } from "next";
import Link from "next/link";
import { CompanyForm } from "@/components/company-form";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { getCompanyContext } from "@/lib/auth/context";
import { countryOptions, currencyOptions, DATE_FORMATS, LOCALES, MONTHS, timezoneOptions } from "@/lib/intl-data";
import { createCompanyAction } from "@/app/install/actions";

export const metadata: Metadata = { title: "New company" };

export default async function NewCompanyPage() {
  const ctx = await getCompanyContext();
  if (!ctx.user.isSuperAdmin) return <Forbidden message="Only the instance owner can create companies." />;
  return (
    <>
      <PageHeader
        title="New company"
        description="Each company has its own customers, documents, settings and team."
        back={
          <Link href="/dashboard" className="text-brand-700 hover:underline focus-ring rounded">
            ← Back to dashboard
          </Link>
        }
      />
      <Card className="max-w-2xl">
        <CardBody className="py-6">
          <CompanyForm
            action={createCompanyAction}
            currencies={currencyOptions()}
            countries={countryOptions()}
            timezones={timezoneOptions()}
            dateFormats={[...DATE_FORMATS]}
            locales={[...LOCALES]}
            months={MONTHS}
            submitLabel="Create company"
          />
        </CardBody>
      </Card>
    </>
  );
}
