"use client";

import { useState } from "react";
import { CheckboxField, Field, SelectField, type FormAction } from "@/components/form";
import { SectionForm } from "@/components/settings/forms";

type Driver = "demo" | "stripe";
type View = { enabled: boolean; driver: Driver; secretsSet: string[]; demoAllowed: boolean };

/** Online payments gateway form. Stored Stripe secrets are never sent to the browser; blank keeps the saved value. */
export function PaymentGatewayForm({ action, view, labels, webhookUrl }: { action: FormAction; view: View; labels: Record<Driver, string>; webhookUrl: string }) {
  const [enabled, setEnabled] = useState(view.enabled);
  const [driver, setDriver] = useState<Driver>(view.driver);
  const saved = (name: string) => view.driver === "stripe" && view.secretsSet.includes(name);
  return (
    <SectionForm action={action}>
      <CheckboxField name="enabled" label="Let customers pay invoices in the portal" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      <fieldset disabled={!enabled} className="space-y-4 disabled:opacity-60">
        <SelectField
          name="driver"
          label="Gateway"
          required
          value={driver}
          onChange={(e) => setDriver(e.target.value as Driver)}
          options={(Object.keys(labels) as Driver[]).filter((d) => d !== "demo" || view.demoAllowed || view.driver === "demo").map((d) => ({ value: d, label: labels[d] }))}
          className="max-w-sm"
        />
        {driver === "demo" ? (
          <p className="text-sm text-muted">Customers see a simulated card checkout and the payment is recorded straight away. No money moves, so use this for previews and testing only.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="secretKey"
              label="Restricted API key"
              required={!saved("secretKey")}
              type="password"
              autoComplete="new-password"
              placeholder={saved("secretKey") ? "Saved. Leave blank to keep." : "rk_test_… or rk_live_…"}
              hint={saved("secretKey") ? "A value is stored on the server and is not shown." : "Create a restricted key with Checkout Sessions: Write and Balance: Read. Stored encrypted."}
            />
            <Field
              name="webhookSecret"
              label="Webhook signing secret"
              required={!saved("webhookSecret")}
              type="password"
              autoComplete="new-password"
              placeholder={saved("webhookSecret") ? "Saved. Leave blank to keep." : "whsec_…"}
              hint={saved("webhookSecret") ? "A value is stored on the server and is not shown." : "Required: records payments even when the customer closes the tab before returning."}
            />
            <div className="sm:col-span-2 text-sm text-muted">
              In the Stripe dashboard, add a webhook endpoint for <code className="break-all rounded bg-subtle px-1">{webhookUrl}</code> with the events{" "}
              <code>checkout.session.completed</code>, <code>checkout.session.async_payment_succeeded</code>, <code>checkout.session.async_payment_failed</code> and <code>checkout.session.expired</code>.
            </div>
          </div>
        )}
      </fieldset>
    </SectionForm>
  );
}
