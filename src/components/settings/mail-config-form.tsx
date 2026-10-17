"use client";

import { useState } from "react";
import { CheckboxField, Field, SelectField, type FormAction } from "@/components/form";
import { SectionForm } from "@/components/settings/forms";
import { DRIVER_FIELDS, DRIVER_LABELS, MAIL_DRIVERS, type MailDriver } from "@/lib/mail-config";

type View = {
  enabled: boolean;
  driver: MailDriver;
  fromAddress: string;
  fromName: string;
  options: Record<string, string>;
  secretsSet: string[];
};

/**
 * Mail driver form (spec §5.12). Stored secrets are never sent to the browser: secret inputs start empty and
 * show whether a value is saved; leaving them blank keeps the saved value.
 */
export function MailConfigForm({ action, view, toggleLabel }: { action: FormAction; view: View; toggleLabel: string }) {
  const [enabled, setEnabled] = useState(view.enabled);
  const [driver, setDriver] = useState<MailDriver>(view.driver);
  const sameDriver = driver === view.driver;
  return (
    <SectionForm action={action}>
      <CheckboxField name="enabled" label={toggleLabel} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      <fieldset disabled={!enabled} className="space-y-4 disabled:opacity-60">
        <SelectField
          name="driver"
          label="Driver"
          required
          value={driver}
          onChange={(e) => setDriver(e.target.value as MailDriver)}
          options={MAIL_DRIVERS.map((d) => ({ value: d, label: DRIVER_LABELS[d] }))}
          className="max-w-sm"
        />
        <div className="grid gap-4 sm:grid-cols-2" key={driver}>
          {DRIVER_FIELDS[driver].map((f) => {
            const saved = sameDriver && view.secretsSet.includes(f.name);
            if (f.type === "select") {
              return (
                <SelectField
                  key={f.name}
                  name={f.name}
                  label={f.label}
                  required={f.required}
                  options={f.options ?? []}
                  defaultValue={(sameDriver ? view.options[f.name] : undefined) ?? f.defaultValue ?? ""}
                />
              );
            }
            return (
              <Field
                key={f.name}
                name={f.name}
                label={f.label}
                required={f.required && !saved}
                type={f.secret ? "password" : f.type === "number" ? "number" : "text"}
                autoComplete={f.secret ? "new-password" : "off"}
                defaultValue={f.secret ? "" : ((sameDriver ? view.options[f.name] : undefined) ?? f.defaultValue ?? "")}
                placeholder={saved ? "Saved. Leave blank to keep." : undefined}
                hint={f.secret ? (saved ? "A value is stored on the server and is not shown." : "Stored encrypted on the server.") : undefined}
              />
            );
          })}
          <Field name="fromAddress" label="From address" type="email" required={driver === "smtp"} defaultValue={view.fromAddress} />
          <Field name="fromName" label="From name" required={driver === "smtp"} defaultValue={view.fromName} />
        </div>
        {driver === "sendmail" || driver === "mail" ? (
          <p className="text-sm text-muted">Uses the sendmail binary on the server. It is not installed in the default container image.</p>
        ) : null}
      </fieldset>
    </SectionForm>
  );
}
