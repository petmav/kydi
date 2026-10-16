import type { Metadata } from "next";
import Link from "next/link";
import { CompanyForm } from "@/components/company-form";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { getCompanyContext } from "@/lib/auth/context";
import { countryOptions, currencyOptions, DATE_FORMATS, LOCALES, timezoneOptions } from "@/lib/intl-data";
import { FISCAL_YEARS } from "@/lib/settings";
import { createCompanyAction } from "@/app/install/actions";

export const metadata: Metadata = { title: "New company" };

export default async function NewCompanyPage() {
  const ctx = await getCompanyContext();
  const ownsAny = ctx.memberships.some((m) => m.company.ownerId === ctx.user.id);
  if (!ownsAny && !ctx.isSuperAdmin) return <Forbidden message="Only company owners can create another company." />;
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
            months={FISCAL_YEARS}
            submitLabel="Create company"
          />
        </CardBody>
      </Card>
    </>
  );
}
