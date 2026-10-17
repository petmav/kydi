"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, Form, SubmitButton, type FormAction } from "@/components/form";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/primitives";

/**
 * Two ways in, always both available: email + password (when the customer has set one) or a one-time code emailed
 * to them. The email can arrive pre-filled from a signed link in invoices, PDFs and portal emails.
 */
export function PortalLoginForm({
  action,
  requestCodeAction,
  codeLoginAction,
  slug,
  defaultEmail = "",
}: {
  action: FormAction;
  requestCodeAction: FormAction;
  codeLoginAction: FormAction;
  slug: string;
  defaultEmail?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [step, setStep] = useState<"start" | "code">("start");

  if (step === "code") {
    return (
      <div className="space-y-4">
        <Form action={codeLoginAction} className="space-y-4" showErrorSummary>
          <p className="text-sm text-ink-2">
            We sent a 6-digit code to <strong className="break-all">{email}</strong>. It expires in 10 minutes.
          </p>
          <input type="hidden" name="email" value={email} />
          <Field name="code" label="Sign-in code" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" />
          <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">Sign in</SubmitButton>
        </Form>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <Form action={requestCodeAction}>
            <input type="hidden" name="email" value={email} />
            <SubmitButton variant="ghost" size="sm" pendingLabel="Sending…">Send a new code</SubmitButton>
          </Form>
          <button type="button" onClick={() => setStep("start")} className="rounded text-brand-700 hover:underline focus-ring">
            Use my password instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Form action={action} className="space-y-4" showErrorSummary>
        <Field name="email" type="email" label="Email" required autoFocus={!defaultEmail} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field name="password" type="password" label="Password" required autoFocus={!!defaultEmail} autoComplete="current-password" />
        <div className="text-right">
          <Link href={`/portal/${slug}/forgot-password`} className="text-sm text-brand-700 hover:underline focus-ring rounded">Forgot password?</Link>
        </div>
        <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">Sign in</SubmitButton>
      </Form>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <Form action={requestCodeAction} onResult={(r) => r.ok && setStep("code")} className="space-y-2">
        <input type="hidden" name="email" value={email} />
        <SubmitButton variant="secondary" className="w-full" size="lg" pendingLabel="Sending…">Email me a sign-in code</SubmitButton>
        <p className="text-center text-xs text-muted">No password needed: we email you a 6-digit code.</p>
      </Form>
    </div>
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

export function PortalProfileForm({ action, profile, hasPassword = true }: { action: FormAction; profile: Profile; hasPassword?: boolean }) {
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
          <Field
            name="password"
            label={hasPassword ? "New password" : "Set a password (optional)"}
            type="password"
            autoComplete="new-password"
            hint={hasPassword ? "Leave blank to keep your current password. Emailed sign-in codes keep working too." : "You sign in with emailed codes. Add a password to also sign in with it; codes keep working."}
          />
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
