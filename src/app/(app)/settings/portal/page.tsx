import type { Metadata } from "next";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { CheckboxField, Field } from "@/components/form";
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
          <CheckboxField
            name="auto_portal_access"
            label="Automatically give customers portal access when invoices are sent"
            hint="Sending an invoice (by email, “Mark as sent” or a recurring invoice) switches the customer’s portal access on and emails them a one-time link to choose a password. Invoice emails and PDFs then show the portal link and the customer’s sign-in email. Customers without an email address, or whose access you switched off, are skipped."
            defaultChecked={ctx.settings.auto_portal_access === "YES"}
          />
        </SectionForm>
      </CardBody>
    </Card>
  );
}
