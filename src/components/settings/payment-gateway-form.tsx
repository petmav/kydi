"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { CheckboxField, Field, SelectField, type FormAction } from "@/components/form";
import { SectionForm } from "@/components/settings/forms";
import { StripeKeyGuide } from "@/components/settings/stripe-key-guide";

type Driver = "demo" | "stripe";
type View = { enabled: boolean; driver: Driver; secretsSet: string[]; demoAllowed: boolean; webhook: "auto" | "manual" | null };

/** Permissions the restricted key needs: create/read checkouts, "Test connection", register Kydi's webhook. */
const KEY_PERMISSIONS = [
  { name: "Checkout Sessions", level: "Write" },
  { name: "Balance", level: "Read" },
  // Stripe lists this one as "Webhook Endpoints, Event Destinations".
  { name: "Webhook Endpoints", level: "Write" },
];

function CopyName({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded border border-line bg-white px-1.5 py-0.5 font-medium text-ink hover:bg-subtle focus-ring"
      aria-label={`Copy “${text}”`}
    >
      {text}
      {copied ? <Check className="h-3 w-3 text-green-600" aria-hidden="true" /> : <Copy className="h-3 w-3 text-muted" aria-hidden="true" />}
    </button>
  );
}

function StripeLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline focus-ring rounded">
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}

/**
 * Online payments setup. For Stripe the owner creates an account and one restricted key; Kydi verifies the key and
 * registers its own webhook. Stored secrets are never sent to the browser; a blank input keeps the saved value.
 */
export function PaymentGatewayForm({ action, view, labels, webhookUrl }: { action: FormAction; view: View; labels: Record<Driver, string>; webhookUrl: string }) {
  const [enabled, setEnabled] = useState(view.enabled);
  const [driver, setDriver] = useState<Driver>(view.driver);
  const saved = (name: string) => view.driver === "stripe" && view.secretsSet.includes(name);
  const connected = saved("secretKey");
  return (
    <SectionForm action={action} submitLabel={driver === "stripe" && !connected ? "Connect Stripe" : "Save changes"}>
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
          <div className="space-y-5">
            <ol className="space-y-4 text-sm">
              <li className="space-y-1">
                <p className="font-semibold">1. Create your Stripe account</p>
                <p className="text-muted">
                  <StripeLink href="https://dashboard.stripe.com/register">Sign up at Stripe</StripeLink> (or sign in). To take real payments, finish <em>Activate payments</em> in Stripe with your business and bank details; payouts go to that bank account. You can test before that.
                </p>
              </li>
              <li className="space-y-2">
                <p className="font-semibold">2. Create a restricted key</p>
                <p className="text-muted">
                  Open <StripeLink href="https://dashboard.stripe.com/apikeys">API keys</StripeLink> (or{" "}
                  <StripeLink href="https://dashboard.stripe.com/test/apikeys">test-mode keys</StripeLink>), click <strong>Create secret key</strong>, keep{" "}
                  <strong>Building your own integration</strong>, then choose <strong>Custom permissions</strong>. Leave everything at None except these (copy a name into Stripe&apos;s search box):
                </p>
                <ul className="flex flex-wrap gap-2 text-xs">
                  {KEY_PERMISSIONS.map((p) => (
                    <li key={p.name} className="inline-flex items-center gap-1.5 rounded-md bg-subtle px-2 py-1">
                      <CopyName text={p.name} />
                      <span className="text-muted">→ {p.level}</span>
                    </li>
                  ))}
                </ul>
                <StripeKeyGuide />
              </li>
              <li className="space-y-2">
                <p className="font-semibold">3. Paste the key here</p>
                <Field
                  name="secretKey"
                  label="Restricted key"
                  required={!connected}
                  type="password"
                  autoComplete="new-password"
                  placeholder={connected ? "Saved. Leave blank to keep, or paste a new key." : "rk_live_… or rk_test_…"}
                  hint={
                    connected
                      ? "A key is stored on the server and is not shown."
                      : "Kydi checks the key and sets up the webhook in your Stripe account for you. Stored encrypted."
                  }
                  className="max-w-xl"
                />
              </li>
            </ol>
            <details className="rounded-md border border-line px-3 py-2 text-sm" open={view.webhook === "manual"}>
              <summary className="cursor-pointer font-medium">Advanced: enter a webhook signing secret yourself</summary>
              <div className="mt-3 space-y-3">
                <p className="text-muted">
                  Only needed when Stripe cannot reach this install, such as local testing with <code>stripe listen --forward-to {webhookUrl}</code>. Otherwise leave it blank and Kydi registers the webhook itself.
                </p>
                <Field
                  name="webhookSecret"
                  label="Webhook signing secret"
                  type="password"
                  autoComplete="new-password"
                  placeholder={view.webhook === "manual" ? "Saved. Leave blank to keep." : "whsec_…"}
                  className="max-w-xl"
                />
              </div>
            </details>
          </div>
        )}
      </fieldset>
    </SectionForm>
  );
}
