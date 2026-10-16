import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { CheckboxField, Field } from "@/components/form";
import { SectionForm } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { saveSettingsSectionAction } from "../actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can change notifications." />;
  const s = ctx.settings;
  return (
    <Card>
      <CardHeader title="Notifications" description="Get an email when customers open documents you sent." />
      <CardBody>
        <SectionForm action={saveSettingsSectionAction.bind(null, "notifications")}>
          <Field name="notification_email" label="Notification email" type="email" required defaultValue={s.notification_email} className="max-w-md" />
          <CheckboxField name="notify_invoice_viewed" label="Invoice viewed" hint="When a customer opens an invoice link or views it in the portal." defaultChecked={s.notify_invoice_viewed === "YES"} />
          <CheckboxField name="notify_estimate_viewed" label="Estimate viewed" hint="When a customer opens an estimate link or views it in the portal." defaultChecked={s.notify_estimate_viewed === "YES"} />
        </SectionForm>
      </CardBody>
    </Card>
  );
}
