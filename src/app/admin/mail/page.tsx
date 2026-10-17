import type { Metadata } from "next";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Field, TextareaField } from "@/components/form";
import { NewButton } from "@/components/settings/forms";
import { MailConfigForm } from "@/components/settings/mail-config-form";
import { requireUser } from "@/lib/auth/context";
import { env } from "@/lib/env";
import { getMailConfigView } from "@/server/mail-settings";
import { savePlatformMailAction, sendPlatformTestMailAction } from "../actions";

export const metadata: Metadata = { title: "Mail configuration · Administration" };

/** Spec §5.13 Settings › Mail configuration: platform default + test mail. */
export default async function AdminMailPage() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") return null;
  const view = await getMailConfigView(null);
  return (
    <Card>
      <CardHeader
        title="Mail configuration"
        description="Default mail driver for password resets, staff notifications and companies without their own configuration."
        actions={
          <NewButton label="Send test mail" title="Send a test email" action={sendPlatformTestMailAction}>
            <Field name="to" label="To" type="email" required defaultValue={user.email} />
            <Field name="subject" label="Subject" required defaultValue="Kydi test email" />
            <TextareaField name="message" label="Message" required defaultValue="If you can read this, outgoing email works." />
          </NewButton>
        }
      />
      <CardBody className="space-y-4">
        {!view.enabled ? (
          <Alert tone="info" title="Using environment settings">
            {env.smtp.host ? `Emails go through the SMTP server ${env.smtp.host} set by environment variables.` : "No SMTP_HOST is set, so emails are written to the server log."}
          </Alert>
        ) : null}
        <MailConfigForm action={savePlatformMailAction} view={view} toggleLabel="Use this configuration instead of the environment settings" />
      </CardBody>
    </Card>
  );
}
