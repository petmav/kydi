import type { Metadata } from "next";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { Field } from "@/components/form";
import { SectionForm } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { getBaseUrl } from "@/lib/url";
import { saveSettingsSectionAction } from "../actions";

export const metadata: Metadata = { title: "Customer portal" };

export default async function PortalSettingsPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can configure the portal." />;
  const url = `${await getBaseUrl()}/portal/${ctx.company.slug}/login`;
  return (
    <Card>
      <CardHeader title="Customer portal" description="Customers with portal access can view and pay attention to their invoices, estimates and payments." />
      <CardBody className="space-y-6">
        <DescriptionList items={[{ label: "Portal login URL", value: <code className="break-all text-xs">{url}</code> }]} />
        <SectionForm action={saveSettingsSectionAction.bind(null, "portal")}>
          <Field name="customer_portal_page_title" label="Portal page title" defaultValue={ctx.settings.customer_portal_page_title} placeholder={ctx.company.name} className="max-w-md" />
        </SectionForm>
      </CardBody>
    </Card>
  );
}
