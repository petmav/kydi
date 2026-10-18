"use client";

import { useState } from "react";
import { Field, FieldError, Form, Label, SelectField, SubmitButton, TextareaField, type FormAction, type Option } from "@/components/form";
import { CustomFieldInputs, type CustomFieldInputDef } from "@/components/custom-field-inputs";
import { ModalForm } from "@/components/modal";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/primitives";

export function ItemFields({
  values,
  units: initialUnits,
  taxes,
  showTaxes,
  customFields,
  customValues,
  isNew,
  unitAction,
  currencySymbol,
}: {
  values: { name?: string; price?: string; unitId?: number | null; description?: string | null; taxIds?: number[] };
  units: Option[];
  taxes: Option[];
  showTaxes: boolean;
  customFields: CustomFieldInputDef[];
  customValues?: Record<number, string | null>;
  isNew: boolean;
  unitAction?: FormAction;
  currencySymbol: string;
}) {
  const [units, setUnits] = useState(initialUnits);
  const [unitId, setUnitId] = useState(values.unitId ? String(values.unitId) : "");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Name" required defaultValue={values.name} maxLength={255} autoFocus={isNew} />
        <Field name="price" label={`Price (${currencySymbol})`} required inputMode="decimal" defaultValue={values.price ?? ""} maxLength={20} inputClassName="tabular text-right" />
        <div>
          <div className="flex items-end gap-2">
            <SelectField name="unitId" label="Unit" options={units} placeholder="No unit" value={unitId} onChange={(e) => setUnitId(e.target.value)} className="flex-1" />
            {unitAction ? (
              <ModalForm
                trigger="Add unit"
                title="Add unit"
                action={unitAction}
                variant="secondary"
                onSuccess={(s) => {
                  const d = s.data as { id: number; name: string } | undefined;
                  if (d) {
                    setUnits((u) => [...u, { value: String(d.id), label: d.name }]);
                    setUnitId(String(d.id));
                  }
                }}
              >
                <Field name="name" label="Unit name" required autoFocus />
              </ModalForm>
            ) : null}
          </div>
        </div>
        {showTaxes ? (
          <div>
            <Label>Default taxes</Label>
            {taxes.length === 0 ? (
              <p className="text-sm text-muted">No sales tax types yet.</p>
            ) : (
              <div className="flex flex-wrap gap-3 rounded-md border border-slate-300 px-3 py-2">
                {taxes.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="taxes" value={t.value} defaultChecked={values.taxIds?.includes(Number(t.value))} className="h-4 w-4 accent-brand-700" />
                    {t.label}
                  </label>
                ))}
              </div>
            )}
            <FieldError name="taxes" />
          </div>
        ) : null}
      </div>
      <TextareaField name="description" label="Description" defaultValue={values.description ?? ""} maxLength={65000} />
      <CustomFieldInputs fields={customFields} values={customValues} isNew={isNew} />
    </div>
  );
}

export function ItemForm(props: Parameters<typeof ItemFields>[0] & { action: FormAction }) {
  const { action, ...rest } = props;
  return (
    <Form action={action} data-tour="item-form">
      <Card>
        <CardBody className="py-5">
          <ItemFields {...rest} />
        </CardBody>
      </Card>
      <div className="mt-4 flex justify-end gap-2" data-tour="item-save">
        <ButtonLink href="/items" variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingLabel="Saving…">{rest.isNew ? "Save item" : "Update item"}</SubmitButton>
      </div>
    </Form>
  );
}
