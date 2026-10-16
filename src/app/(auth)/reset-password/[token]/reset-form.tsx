"use client";

import { Field, Form, SubmitButton } from "@/components/form";
import { resetPasswordAction } from "../../actions";

export function ResetForm({ token }: { token: string }) {
  return (
    <Form action={resetPasswordAction} className="space-y-4" showErrorSummary>
      <input type="hidden" name="token" value={token} />
      <Field name="password" type="password" label="New password" autoComplete="new-password" required autoFocus />
      <Field name="confirm" type="password" label="Confirm new password" autoComplete="new-password" required />
      <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">
        Update password
      </SubmitButton>
    </Form>
  );
}
