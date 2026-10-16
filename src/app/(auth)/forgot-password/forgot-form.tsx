"use client";

import { useState } from "react";
import { Field, Form, SubmitButton } from "@/components/form";
import { Alert } from "@/components/ui/primitives";
import { forgotPasswordAction } from "../actions";

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <Alert tone="success" title="Check your inbox">
        If an account exists for that email, we&apos;ve sent a link to reset your password. The link expires in 60 minutes.
      </Alert>
    );
  }
  return (
    <Form action={forgotPasswordAction} className="space-y-4" onResult={(s) => s.ok && setSent(true)}>
      <Field name="email" type="email" label="Email" autoComplete="email" required autoFocus />
      <SubmitButton className="w-full" size="lg" pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </Form>
  );
}
