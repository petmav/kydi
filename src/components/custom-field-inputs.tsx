"use client";

import { CheckboxField, Field, SelectField, TextareaField } from "@/components/form";

export type CustomFieldInputDef = {
  id: number;
  label: string;
  type: string;
  placeholder: string | null;
  options: string[];
  defaultAnswer: string | null;
  isRequired: boolean;
};

export function CustomFieldInputs({
  fields,
  values,
  isNew,
}: {
  fields: CustomFieldInputDef[];
  values?: Record<number, string | null>;
  isNew?: boolean;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const name = `cf_${f.id}`;
        const value = values?.[f.id] ?? (isNew ? f.defaultAnswer : null) ?? "";
        const common = { name, label: f.label, required: f.isRequired, placeholder: f.placeholder ?? undefined };
        switch (f.type) {
          case "TextArea":
            return <TextareaField key={f.id} {...common} defaultValue={value} className="sm:col-span-2" />;
          case "Dropdown":
            return (
              <SelectField
                key={f.id}
                {...common}
                options={f.options.map((o) => ({ value: o, label: o }))}
                placeholder="Select…"
                defaultValue={value}
              />
            );
          case "Switch":
            return <CheckboxField key={f.id} name={name} label={f.label} defaultChecked={value === "true"} className="self-end pb-2" />;
          case "Number":
            return <Field key={f.id} {...common} type="number" step="any" defaultValue={value} />;
          case "Date":
            return <Field key={f.id} {...common} type="date" defaultValue={value} />;
          case "Time":
            return <Field key={f.id} {...common} type="time" defaultValue={value} />;
          case "DateTime":
            return <Field key={f.id} {...common} type="datetime-local" defaultValue={value} />;
          case "Url":
            return <Field key={f.id} {...common} type="url" defaultValue={value} />;
          case "Phone":
            return <Field key={f.id} {...common} type="tel" defaultValue={value} />;
          default:
            return <Field key={f.id} {...common} defaultValue={value} />;
        }
      })}
    </div>
  );
}
