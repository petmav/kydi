"use client";

import { Field, Form, SubmitButton } from "@/components/form";
import { registerFromInvitationAction } from "../actions";

export function RegisterForm({ token, email }: { token: string; email: string }) {
  return (
    <Form action={registerFromInvitationAction} className="space-y-4" showErrorSummary>
      <input type="hidden" name="token" value={token} />
      <Field name="email" label="Email" value={email} readOnly disabled />
      <Field name="name" label="Full name" required autoFocus autoComplete="name" />
      <Field name="password" label="Password" type="password" required autoComplete="new-password" hint="At least 10 characters; avoid common passwords." />
      <Field name="confirm" label="Confirm password" type="password" required autoComplete="new-password" />
      <SubmitButton className="w-full" pendingLabel="Creating account…">
        Create account and join
      </SubmitButton>
    </Form>
  );
}
