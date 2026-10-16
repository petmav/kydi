import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { Field } from "@/components/form";
import { SectionForm, TemplateTextarea } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { COMPANY_PLACEHOLDERS, CUSTOMER_PLACEHOLDERS, ESTIMATE_PLACEHOLDERS, INVOICE_PLACEHOLDERS, PAYMENT_PLACEHOLDERS } from "@/lib/placeholders";
import { saveSettingsSectionAction } from "../actions";

export const metadata: Metadata = { title: "Email templates" };

export default async function EmailTemplatesPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can edit email templates." />;
  const s = ctx.settings;
  const base = ["COMPANY_NAME", ...CUSTOMER_PLACEHOLDERS, ...COMPANY_PLACEHOLDERS.slice(1, 4)];
  const sections = [
    { key: "invoice", title: "Invoice email", ph: [...INVOICE_PLACEHOLDERS, ...base] },
    { key: "estimate", title: "Estimate email", ph: [...ESTIMATE_PLACEHOLDERS, ...base] },
    { key: "payment", title: "Payment receipt email", ph: [...PAYMENT_PLACEHOLDERS, ...base] },
  ] as const;
  return (
    <Card>
      <CardHeader
        title="Email templates"
        description="Default subject and body for document emails. Placeholders are replaced when sending; a “View” button linking to the document is added automatically."
      />
      <CardBody>
        <SectionForm action={saveSettingsSectionAction.bind(null, "emails")}>
          {sections.map((sec) => (
            <fieldset key={sec.key} className="space-y-3 rounded-md border border-line p-4">
              <legend className="px-1 text-sm font-semibold">{sec.title}</legend>
              <Field name={`${sec.key}_mail_subject`} label="Subject" required defaultValue={s[`${sec.key}_mail_subject`]} />
              <TemplateTextarea name={`${sec.key}_mail_body`} label="Body (HTML)" defaultValue={s[`${sec.key}_mail_body`]} placeholders={[...sec.ph]} rows={5} />
            </fieldset>
          ))}
        </SectionForm>
      </CardBody>
    </Card>
  );
}
