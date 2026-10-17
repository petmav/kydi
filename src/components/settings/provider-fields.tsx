"use client";

import { useState } from "react";
import { CheckboxField, Field, FieldError, Label, SelectField } from "@/components/form";
import { inputClass } from "@/components/ui/primitives";
import { CONVERTER_PLANS, RATE_DRIVERS, RATE_DRIVER_LABELS, type RateDriver } from "@/lib/exchange-rates";
import { cn } from "@/lib/utils";

/** Exchange-rate provider modal fields (spec §5.12). The stored API key is never sent to the browser. */
export function ProviderFields({
  provider,
  currencies,
  inUse,
}: {
  provider?: { driver: RateDriver; currencies: string[]; active: boolean; planType: string; url: string; hasKey: boolean };
  currencies: { value: string; label: string }[];
  inUse: string[];
}) {
  const [driver, setDriver] = useState<RateDriver>(provider?.driver ?? "currency_converter");
  const [plan, setPlan] = useState(provider?.planType ?? "FREE");
  return (
    <>
      <SelectField
        name="driver"
        label="Provider"
        required
        value={driver}
        onChange={(e) => setDriver(e.target.value as RateDriver)}
        options={RATE_DRIVERS.map((d) => ({ value: d, label: RATE_DRIVER_LABELS[d] }))}
      />
      <Field
        name="key"
        label="API key"
        type="password"
        autoComplete="new-password"
        required={!provider?.hasKey}
        placeholder={provider?.hasKey ? "Saved. Leave blank to keep." : undefined}
        hint="Stored encrypted on the server and never shown again."
      />
      {driver === "currency_converter" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="planType" label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)} options={[...CONVERTER_PLANS]} />
          {plan === "DEDICATED" ? <Field name="url" label="Server URL" required defaultValue={provider?.url ?? ""} hint="Public http(s) address of your dedicated server." /> : null}
        </div>
      ) : null}
      <div>
        <Label htmlFor="provider-currencies" required>
          Currencies
        </Label>
        <select
          id="provider-currencies"
          name="currencies"
          multiple
          size={8}
          defaultValue={provider?.currencies ?? []}
          className={cn(inputClass, "font-mono text-xs")}
        >
          {currencies.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
              {inUse.includes(c.value) ? " (in use)" : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">Hold Ctrl or Cmd to select several. A currency can be served by one active provider only.</p>
        <FieldError name="currencies" />
      </div>
      <CheckboxField name="active" label="Active" defaultChecked={provider?.active ?? true} />
    </>
  );
}
