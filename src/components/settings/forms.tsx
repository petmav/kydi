"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  CheckboxField,
  Field,
  FieldError,
  Form,
  Label,
  SelectField,
  SubmitButton,
  TextareaField,
  useFieldError,
  type FormAction,
  type Option,
} from "@/components/form";
import { RichTextEditor } from "@/components/rich-text-editor";
import { ModalForm } from "@/components/modal";
import { ConfirmButton } from "@/components/confirm";
import { inputClass } from "@/components/ui/primitives";
import { renderNumber, TOKEN_NAMES } from "@/domain/numbering";
import type { ActionState } from "@/lib/action";
import { ABILITY_DEPENDENCIES, ABILITY_GROUPS } from "@/lib/abilities";
import { cn } from "@/lib/utils";

// ---- generic helpers -------------------------------------------------------------

export function SectionForm({ action, children, submitLabel = "Save changes" }: { action: FormAction; children: React.ReactNode; submitLabel?: string }) {
  return (
    <Form action={action} className="space-y-5">
      {children}
      <div className="flex justify-end border-t border-line pt-4">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}

export function RowActions({
  editTitle,
  editAction,
  editFields,
  deleteAction,
  deleteTitle,
  deleteDescription,
  wide,
}: {
  editTitle?: string;
  editAction?: FormAction;
  editFields?: React.ReactNode;
  deleteAction?: () => Promise<ActionState>;
  deleteTitle?: string;
  deleteDescription?: string;
  wide?: boolean;
}) {
  return (
    <div className="flex justify-end gap-1">
      {editAction && editTitle ? (
        <ModalForm trigger={<Pencil className="h-4 w-4" aria-label={editTitle} />} title={editTitle} action={editAction} variant="ghost" size="sm" wide={wide}>
          {editFields}
        </ModalForm>
      ) : null}
      {deleteAction ? (
        <ConfirmButton
          action={deleteAction}
          title={deleteTitle ?? "Delete?"}
          description={deleteDescription ?? "This cannot be undone."}
          confirmLabel="Delete"
          variant="ghost"
          size="sm"
        >
          <Trash2 className="h-4 w-4 text-red-600" aria-label={deleteTitle ?? "Delete"} />
        </ConfirmButton>
      ) : null}
    </div>
  );
}

export function NewButton({ label, title, action, children, wide }: { label: string; title: string; action: FormAction; children: React.ReactNode; wide?: boolean }) {
  return (
    <ModalForm
      trigger={
        <>
          <Plus className="h-4 w-4" aria-hidden="true" /> {label}
        </>
      }
      title={title}
      action={action}
      size="sm"
      wide={wide}
    >
      {children}
    </ModalForm>
  );
}

// ---- placeholder-aware rich-text field ------------------------------------------------

export function TemplateTextarea({
  name,
  label,
  defaultValue,
  placeholders,
  rows = 6,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholders: string[];
  rows?: number;
  hint?: string;
}) {
  const err = useFieldError(name);
  return (
    <div>
      <Label htmlFor={`tt-${name}`}>{label}</Label>
      <RichTextEditor id={`tt-${name}`} name={name} label={label} defaultValue={defaultValue} placeholders={placeholders} rows={rows} invalid={!!err} />
      <FieldError name={name} />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

// ---- number format builder ------------------------------------------------------------

const TOKEN_HINTS: Record<string, string> = {
  SERIES: "{{SERIES:INV}}",
  DELIMITER: "{{DELIMITER:-}}",
  SEQUENCE: "{{SEQUENCE:6}}",
  CUSTOMER_SEQUENCE: "{{CUSTOMER_SEQUENCE:4}}",
  CUSTOMER_SERIES: "{{CUSTOMER_SERIES}}",
  DATE_FORMAT: "{{DATE_FORMAT:Y}}",
  RANDOM_SEQUENCE: "{{RANDOM_SEQUENCE:6}}",
};

export function NumberFormatField({ name, label, defaultValue, nextSequence }: { name: string; label: string; defaultValue: string; nextSequence: number }) {
  const [value, setValue] = useState(defaultValue);
  const preview = useMemo(() => {
    try {
      return renderNumber(value, { sequence: nextSequence, customerSequence: 1, customerPrefix: "", random: (n) => "A1B2C3D4E5".slice(0, n) });
    } catch {
      return "";
    }
  }, [value, nextSequence]);
  return (
    <div>
      <Label htmlFor={`nf-${name}`}>{label}</Label>
      <input id={`nf-${name}`} name={name} value={value} onChange={(e) => setValue(e.target.value)} className={cn(inputClass, "font-mono")} />
      <FieldError name={name} />
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {TOKEN_NAMES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setValue((v) => v + TOKEN_HINTS[t])}
            className="rounded-md border border-line bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 hover:bg-brand-50 focus-ring"
          >
            + {t}
          </button>
        ))}
        <button type="button" onClick={() => setValue("")} className="ml-1 text-xs text-red-700 hover:underline focus-ring rounded">
          Clear
        </button>
      </div>
      <p className="mt-2 text-sm">
        Next number preview: <span className="rounded bg-brand-50 px-2 py-0.5 font-mono font-semibold text-brand-800">{preview || "—"}</span>
      </p>
    </div>
  );
}

// ---- tax type modal fields ---------------------------------------------------------------

export function TaxTypeFields({
  tax,
}: {
  tax?: { id: number; name: string; transactionType: string; calculationType: string; percent: number | null; fixedAmount: string; description: string | null; compound: boolean };
}) {
  const [calc, setCalc] = useState(tax?.calculationType ?? "PERCENTAGE");
  return (
    <>
      {tax ? <input type="hidden" name="id" value={tax.id} /> : null}
      <Field name="name" label="Name" required defaultValue={tax?.name} autoFocus />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="transactionType"
          label="Used for"
          options={[
            { value: "SALES", label: "Sales (invoices, estimates)" },
            { value: "PURCHASES", label: "Purchases (expenses)" },
          ]}
          defaultValue={tax?.transactionType ?? "SALES"}
        />
        <SelectField
          name="calculationType"
          label="Calculation"
          options={[
            { value: "PERCENTAGE", label: "Percentage" },
            { value: "FIXED", label: "Fixed amount" },
          ]}
          value={calc}
          onChange={(e) => setCalc(e.target.value)}
        />
      </div>
      {calc === "PERCENTAGE" ? (
        <Field name="percent" label="Percent" type="number" step="0.01" min="0" max="100" required defaultValue={tax?.percent ?? ""} />
      ) : (
        <Field name="fixedAmount" label="Fixed amount" inputMode="decimal" required defaultValue={tax?.fixedAmount ?? ""} hint="Charged once per line or document, regardless of quantity." />
      )}
      <TextareaField name="description" label="Description" defaultValue={tax?.description ?? ""} maxLength={255} />
      <CheckboxField name="compound" label="Compound tax" hint="Charged on the amount plus the other (simple) taxes." defaultChecked={tax?.compound} />
    </>
  );
}

// ---- custom field modal fields ---------------------------------------------------------------

export function CustomFieldFields({
  field,
  models,
  types,
}: {
  field?: {
    id: number;
    modelType: string;
    name: string;
    label: string;
    type: string;
    placeholder: string | null;
    options: string[];
    defaultAnswer: string | null;
    order: number;
    isRequired: boolean;
    placement: string;
    inUse: boolean;
    validation: Record<string, string | number | null> | null;
  };
  models: string[];
  types: string[];
}) {
  const [type, setType] = useState(field?.type ?? "Input");
  const v = field?.validation ?? {};
  const locked = field?.inUse ?? false;
  const textual = ["Input", "TextArea"].includes(type);
  const dated = ["Date", "Time", "DateTime"].includes(type);
  return (
    <>
      {field ? <input type="hidden" name="id" value={field.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="modelType"
          label="Model"
          required
          options={models.map((m) => ({ value: m, label: m }))}
          defaultValue={field?.modelType ?? "Customer"}
          disabled={locked}
          hint={locked ? "Locked: field has answers." : undefined}
        />
        <SelectField
          name="type"
          label="Type"
          required
          options={types.map((t) => ({ value: t, label: t }))}
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={locked}
        />
        {locked ? (
          <>
            <input type="hidden" name="modelType" value={field?.modelType} />
            <input type="hidden" name="type" value={type} />
          </>
        ) : null}
        <Field name="name" label="Name" required defaultValue={field?.name} hint="Used in the {CUSTOM_…} placeholder." />
        <Field name="label" label="Label" required defaultValue={field?.label} />
        <Field name="placeholder" label="Placeholder" defaultValue={field?.placeholder ?? ""} />
        <Field name="order" label="Order" type="number" min="0" required defaultValue={field?.order ?? 1} />
      </div>
      {type === "Dropdown" ? (
        <TextareaField name="options" label="Options" hint="One option per line." defaultValue={field?.options.join("\n") ?? ""} required />
      ) : null}
      <Field name="defaultAnswer" label="Default value" defaultValue={field?.defaultAnswer ?? ""} hint={type === "Switch" ? "Use true or false." : undefined} />
      <div className="flex flex-wrap gap-6">
        <CheckboxField name="isRequired" label="Required" defaultChecked={field?.isRequired} />
        <CheckboxField name="showOnDocument" label="Show on document (PDF)" defaultChecked={field?.placement === "document"} />
      </div>
      <fieldset className="rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-medium">Validation</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {textual ? (
            <>
              <Field name="min_length" label="Min length" type="number" min="0" defaultValue={v.min_length ?? ""} />
              <Field name="max_length" label="Max length" type="number" min="0" defaultValue={v.max_length ?? ""} />
              <Field name="pattern" label="Pattern (regex)" defaultValue={v.pattern ?? ""} className="sm:col-span-2" />
            </>
          ) : null}
          {type === "Number" ? (
            <>
              <Field name="min" label="Minimum" type="number" step="any" defaultValue={v.min ?? ""} />
              <Field name="max" label="Maximum" type="number" step="any" defaultValue={v.max ?? ""} />
            </>
          ) : null}
          {dated ? (
            <>
              <Field name="earliest" label="Earliest" defaultValue={v.earliest ?? ""} hint='A fixed value or "today".' />
              <Field name="latest" label="Latest" defaultValue={v.latest ?? ""} hint='A fixed value or "today".' />
            </>
          ) : null}
          {!textual && type !== "Number" && !dated ? <p className="text-sm text-muted sm:col-span-2">No extra validation for this type.</p> : null}
        </div>
      </fieldset>
    </>
  );
}

// ---- role editor -------------------------------------------------------------------------------

function closure(selected: Set<string>): Set<string> {
  const out = new Set<string>();
  const visit = (a: string) => {
    if (out.has(a)) return;
    out.add(a);
    (ABILITY_DEPENDENCIES[a] ?? []).forEach(visit);
  };
  selected.forEach(visit);
  return out;
}

export function RoleFields({ role }: { role?: { id: number; title: string; abilities: string[] } }) {
  const [explicit, setExplicit] = useState<Set<string>>(new Set(role?.abilities ?? []));
  const effective = closure(explicit);
  const toggle = (a: string, on: boolean) =>
    setExplicit((prev) => {
      const next = new Set(prev);
      if (on) next.add(a);
      else next.delete(a);
      return next;
    });
  return (
    <>
      {role ? <input type="hidden" name="id" value={role.id} /> : null}
      <Field name="title" label="Role name" required defaultValue={role?.title} autoFocus />
      <FieldError name="abilities" />
      <div className="grid gap-4 sm:grid-cols-2">
        {ABILITY_GROUPS.map((g) => {
          const all = g.abilities.every((a) => effective.has(a.ability));
          return (
            <fieldset key={g.key} className="rounded-md border border-line p-3">
              <legend className="flex w-full items-center justify-between px-1 text-sm font-semibold">
                {g.label}
              </legend>
              <button
                type="button"
                className="mb-2 text-xs font-medium text-brand-700 hover:underline focus-ring rounded"
                onClick={() =>
                  setExplicit((prev) => {
                    const next = new Set(prev);
                    g.abilities.forEach((a) => (all ? next.delete(a.ability) : next.add(a.ability)));
                    return next;
                  })
                }
              >
                {all ? "Clear all" : "Select all"}
              </button>
              <ul className="space-y-1.5">
                {g.abilities.map((a) => {
                  const checked = effective.has(a.ability);
                  const forced = checked && !explicit.has(a.ability);
                  return (
                    <li key={a.ability}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="abilities"
                          value={a.ability}
                          checked={checked}
                          disabled={forced}
                          onChange={(e) => toggle(a.ability, e.target.checked)}
                          className="h-4 w-4 rounded border-line focus-ring"
                        />
                        {forced ? <input type="hidden" name="abilities" value={a.ability} /> : null}
                        <span className={forced ? "text-muted" : ""}>{a.label}</span>
                        {forced ? <span className="text-[11px] text-muted">(required)</span> : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </>
  );
}

export type { Option };
