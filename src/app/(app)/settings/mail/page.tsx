import type { Metadata } from "next";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { Field, TextareaField } from "@/components/form";
import { NewButton } from "@/components/settings/forms";
import { MailConfigForm } from "@/components/settings/mail-config-form";
import { getCompanyContext } from "@/lib/auth/context";
import { env } from "@/lib/env";
import { DRIVER_LABELS } from "@/lib/mail-config";
import { getMailConfigView } from "@/server/mail-settings";
import { sendTestMailAction, saveMailConfigAction } from "../misc-actions";

export const metadata: Metadata = { title: "Mail configuration" };

export default async function MailPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can manage mail configuration." />;
  const [own, platform] = await Promise.all([getMailConfigView(ctx.companyId), getMailConfigView(null)]);
  const fallback = platform.exists && platform.enabled ? `the platform mail configuration (${DRIVER_LABELS[platform.driver]})` : env.smtp.host ? "the installation SMTP server" : "the server log (no mail server is configured)";
  return (
    <Card>
      <CardHeader
        title="Mail configuration"
        description="Choose how this company sends invoices, estimates, receipts and notifications."
        actions={
          <NewButton label="Send test mail" title="Send a test email" action={sendTestMailAction}>
            <Field name="to" label="To" type="email" required defaultValue={ctx.user.email} />
            <Field name="subject" label="Subject" required defaultValue="Kydi test email" />
            <TextareaField name="message" label="Message" required defaultValue="If you can read this, outgoing email works." />
          </NewButton>
        }
      />
      <CardBody className="space-y-4">
        {own.enabled ? (
          <Alert tone="success" title={`Using custom mail configuration (${DRIVER_LABELS[own.driver]})`}>
            Save first, then send a test mail to check the settings.
          </Alert>
        ) : (
          <Alert tone="info" title="Using global mail configuration">
            Emails are sent through {fallback}.
          </Alert>
        )}
        <MailConfigForm action={saveMailConfigAction} view={own} toggleLabel="Use custom mail configuration" />
      </CardBody>
    </Card>
  );
}
