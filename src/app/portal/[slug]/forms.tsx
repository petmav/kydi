"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, Form, SubmitButton, type FormAction } from "@/components/form";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/primitives";

export function PortalLoginForm({ action, slug }: { action: FormAction; slug: string }) {
  return (
    <Form action={action} className="space-y-4" showErrorSummary>
      <Field name="email" type="email" label="Email" required autoFocus autoComplete="email" />
      <Field name="password" type="password" label="Password" required autoComplete="current-password" />
      <div className="text-right">
        <Link href={`/portal/${slug}/forgot-password`} className="text-sm text-brand-700 hover:underline focus-ring rounded">Forgot password?</Link>
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">Sign in</SubmitButton>
    </Form>
  );
}

export function PortalForgotForm({ action }: { action: FormAction }) {
  const [sent, setSent] = useState(false);
  if (sent) return <Alert tone="success" title="Check your inbox">If an account exists for that email, a reset link is on its way.</Alert>;
  return (
    <Form action={action} className="space-y-4" onResult={(s) => s.ok && setSent(true)}>
      <Field name="email" type="email" label="Email" required autoFocus />
      <SubmitButton className="w-full" pendingLabel="Sending…">Send reset link</SubmitButton>
    </Form>
  );
}

export function PortalResetForm({ action, token, submitLabel = "Update password" }: { action: FormAction; token: string; submitLabel?: string }) {
  return (
    <Form action={action} className="space-y-4" showErrorSummary>
      <input type="hidden" name="token" value={token} />
      <Field name="password" type="password" label="New password" required autoComplete="new-password" />
      <Field name="confirm" type="password" label="Confirm new password" required autoComplete="new-password" />
      <SubmitButton className="w-full" pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </Form>
  );
}

type Profile = Record<string, string | null>;

export function PortalProfileForm({ action, profile }: { action: FormAction; profile: Profile }) {
  const addr = (p: "billing" | "shipping", title: string) => (
    <Card>
      <CardHeader title={title} />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field name={`${p}Street1`} label="Address line 1" defaultValue={profile[`${p}Street1`] ?? ""} />
        <Field name={`${p}Street2`} label="Address line 2" defaultValue={profile[`${p}Street2`] ?? ""} />
        <Field name={`${p}City`} label="City" defaultValue={profile[`${p}City`] ?? ""} />
        <Field name={`${p}State`} label="State" defaultValue={profile[`${p}State`] ?? ""} />
        <Field name={`${p}Zip`} label="ZIP / postal code" defaultValue={profile[`${p}Zip`] ?? ""} />
        <Field name={`${p}Phone`} label="Phone" defaultValue={profile[`${p}Phone`] ?? ""} />
      </CardBody>
    </Card>
  );
  return (
    <Form action={action} className="space-y-6">
      <Card>
        <CardHeader title="Profile" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Name" required defaultValue={profile.name ?? ""} />
          <Field name="email" label="Email" type="email" required defaultValue={profile.email ?? ""} />
          <Field name="password" label="New password" type="password" autoComplete="new-password" hint="Leave blank to keep your current password." />
          <Field name="confirm" label="Confirm new password" type="password" autoComplete="new-password" />
        </CardBody>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        {addr("billing", "Billing address")}
        {addr("shipping", "Shipping address")}
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </Form>
  );
}
