"use client";

import { Field, Form, SubmitButton } from "@/components/form";
import { installAdminAction } from "./actions";

export function AdminForm({ requireToken }: { requireToken: boolean }) {
  return (
    <Form action={installAdminAction} className="space-y-4" showErrorSummary>
      {requireToken ? (
        <Field
          name="install_token"
          label="Install token"
          required
          autoComplete="off"
          spellCheck={false}
          hint="Printed in the application log when Kydi starts (format XXXXX-XXXXX-XXXXX-XXXXX)."
        />
      ) : null}
      <Field name="name" label="Full name" required autoFocus={!requireToken} autoComplete="name" />
      <Field name="email" type="email" label="Email" required autoComplete="email" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="password" type="password" label="Password" required autoComplete="new-password" hint="At least 10 characters; avoid common passwords." />
        <Field name="confirm" type="password" label="Confirm password" required autoComplete="new-password" />
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating account…">
        Continue
      </SubmitButton>
    </Form>
  );
}
