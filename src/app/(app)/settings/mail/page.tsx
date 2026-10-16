import type { Metadata } from "next";
import { Alert, Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { Field, TextareaField } from "@/components/form";
import { NewButton } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { env } from "@/lib/env";
import { sendTestMailAction } from "../misc-actions";

export const metadata: Metadata = { title: "Mail configuration" };

export default async function MailPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can manage mail configuration." />;
  const configured = !!env.smtp.host;
  return (
    <Card>
      <CardHeader
        title="Mail configuration"
        description="Halyard uses the installation's SMTP settings (environment variables)."
        actions={
          <NewButton label="Send test mail" title="Send a test email" action={sendTestMailAction}>
            <Field name="to" label="To" type="email" required defaultValue={ctx.user.email} />
            <Field name="subject" label="Subject" required defaultValue="Halyard test email" />
            <TextareaField name="message" label="Message" required defaultValue="If you can read this, outgoing email works." />
          </NewButton>
        }
      />
      <CardBody className="space-y-4">
        {configured ? (
          <Alert tone="success" title="Using global mail configuration">
            Emails are delivered through SMTP.
          </Alert>
        ) : (
          <Alert tone="warning" title="SMTP not configured">
            Emails are written to the server log (stdout) instead of being delivered. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM to
            enable delivery.
          </Alert>
        )}
        <DescriptionList
          items={[
            { label: "Driver", value: configured ? "SMTP" : "Log (stdout)" },
            { label: "Host", value: env.smtp.host || null },
            { label: "Port", value: configured ? String(env.smtp.port) : null },
            { label: "Encryption", value: configured ? (env.smtp.port === 465 ? "SSL/TLS" : "STARTTLS when offered") : null },
            { label: "From", value: env.smtp.from },
          ]}
        />
        <p className="text-xs text-muted">Per-company mail drivers (Mailgun, SES, Postmark) are not available in this version.</p>
      </CardBody>
    </Card>
  );
}
