"use client";

import Link from "next/link";
import { Field, Form, SubmitButton } from "@/components/form";
import { loginAction } from "../actions";

export function LoginForm({ next, demo }: { next?: string; demo?: boolean }) {
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
        defaultValue={demo ? "admin@halyard.test" : undefined}
      />
      <div>
        <Field
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          defaultValue={demo ? "password123" : undefined}
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
