"use client";

import Link from "next/link";
import { Field, Form, SubmitButton } from "@/components/form";
import { loginAction } from "../actions";

/** `prefill` is only passed in local development with demo data; production never pre-fills credentials. */
export function LoginForm({ next, prefill }: { next?: string; prefill?: { email: string; password: string } }) {
  return (
    <Form action={loginAction} className="space-y-4" showErrorSummary>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        autoFocus
        defaultValue={prefill?.email}
      />
      <div>
        <Field
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          defaultValue={prefill?.password}
        />
        <div className="mt-2 text-right">
          <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline focus-ring rounded">
            Forgot password?
          </Link>
        </div>
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </Form>
  );
}
