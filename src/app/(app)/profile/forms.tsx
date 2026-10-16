"use client";

import { Field, Form, SubmitButton } from "@/components/form";
import { ConfirmButton } from "@/components/confirm";
import { changePasswordAction, signOutOtherSessionsAction, updateProfileAction } from "./actions";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  return (
    <Form action={updateProfileAction} className="space-y-4">
      <Field name="name" label="Full name" defaultValue={name} required autoComplete="name" />
      <Field name="email" type="email" label="Email" defaultValue={email} required autoComplete="email" />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </Form>
  );
}

export function PasswordForm() {
  return (
    <Form action={changePasswordAction} className="space-y-4" resetOnSuccess>
      <Field name="current" type="password" label="Current password" required autoComplete="current-password" />
      <Field name="password" type="password" label="New password" required autoComplete="new-password" hint="At least 8 characters." />
      <Field name="confirm" type="password" label="Confirm new password" required autoComplete="new-password" />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
      </div>
    </Form>
  );
}

export function SessionsCard() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">Lost a device or used a shared computer? Sign out everywhere except here.</p>
      <ConfirmButton
        action={signOutOtherSessionsAction}
        title="Sign out other sessions?"
        description="All other browsers and devices will need to sign in again."
        confirmLabel="Sign out others"
      >
        Sign out other sessions
      </ConfirmButton>
    </div>
  );
}
