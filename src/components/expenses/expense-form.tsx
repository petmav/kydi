"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CheckboxField, Field, FieldError, Form, Label, SubmitButton, type FormAction, type Option } from "@/components/form";
import { CustomFieldInputs, type CustomFieldInputDef } from "@/components/custom-field-inputs";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, inputClass } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Props = {
  action: FormAction;
  categories: Option[];
  customers: Option[];
  methods: Option[];
  purchaseTaxes: Option[];
  currencies: Option[];
  companyCurrency: string;
  initial: { expenseDate: string; expenseNumber: string; categoryId: string; amount: string; currency: string; exchangeRate: string; customerId: string; paymentMethodId: string; notes: string; taxes: { taxTypeId: string; amount: string }[] };
  receipt: { name: string; url: string } | null;
  customFields: CustomFieldInputDef[];
  customValues?: Record<number, string | null>;
  isNew: boolean;
};

export function ExpenseForm({ action, categories, customers, methods, purchaseTaxes, currencies, companyCurrency, initial, receipt, customFields, customValues, isNew }: Props) {
  const [v, setV] = useState(initial);
  const set = (patch: Partial<typeof initial>) => setV((x) => ({ ...x, ...patch }));
  const foreign = v.currency !== companyCurrency;
  const payload = JSON.stringify({ ...v, exchangeRate: foreign ? v.exchangeRate : 1, taxes: v.taxes.filter((t) => t.taxTypeId).map((t) => ({ taxTypeId: Number(t.taxTypeId), amount: t.amount || "0" })) });
  const sel = (id: string, label: string, value: string, options: Option[], onChange: (s: string) => void, required = false, placeholder = "None") => (
    <div>
      <Label htmlFor={id} required={required}>{label}</Label>
      <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  return (
    <Form action={action} className="space-y-6">
      <input type="hidden" name="payload" value={payload} />
      <Card>
        <CardHeader title="Expense details" />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            {sel("e-cat", "Category", v.categoryId, categories, (s) => set({ categoryId: s }), true, "Select a category…")}
            <FieldError name="categoryId" />
            {categories.length === 0 ? <p className="mt-1 text-xs text-muted">Create categories under Settings → Expense categories.</p> : null}
          </div>
          <div>
            <Label htmlFor="e-date" required>Expense date</Label>
            <input id="e-date" type="date" className={inputClass} value={v.expenseDate} onChange={(e) => set({ expenseDate: e.target.value })} />
            <FieldError name="expenseDate" />
          </div>
          <div>
            <Label htmlFor="e-num">Expense number</Label>
            <input id="e-num" className={inputClass} value={v.expenseNumber} maxLength={255} onChange={(e) => set({ expenseNumber: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="e-amount" required>Amount</Label>
            <input id="e-amount" inputMode="decimal" className={cn(inputClass, "tabular text-right")} value={v.amount} onChange={(e) => set({ amount: e.target.value })} />
            <FieldError name="amount" />
          </div>
          <div>{sel("e-cur", "Currency", v.currency, currencies, (s) => set({ currency: s || companyCurrency }), true, companyCurrency)}</div>
          {foreign ? (
            <div>
              <Label htmlFor="e-rate" required>Exchange rate</Label>
              <div className="flex items-center gap-2 text-sm">
                <span className="whitespace-nowrap">1 {v.currency} =</span>
                <input id="e-rate" inputMode="decimal" className={cn(inputClass, "tabular")} value={v.exchangeRate} onChange={(e) => set({ exchangeRate: e.target.value })} />
                <span>{companyCurrency}</span>
              </div>
              <FieldError name="exchangeRate" />
            </div>
          ) : null}
          <div>{sel("e-cust", "Customer", v.customerId, customers, (s) => set({ customerId: s }))}<FieldError name="customerId" /></div>
          <div>{sel("e-method", "Payment mode", v.paymentMethodId, methods, (s) => set({ paymentMethodId: s }))}</div>
        </CardBody>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Purchase taxes" description="Optional breakdown of the tax included in the amount." />
          <CardBody className="space-y-2">
            {v.taxes.map((t, i) => (
              <div key={i} className="flex gap-2">
                <select aria-label="Tax type" className={inputClass} value={t.taxTypeId} onChange={(e) => set({ taxes: v.taxes.map((x, j) => (j === i ? { ...x, taxTypeId: e.target.value } : x)) })}>
                  <option value="">Select tax…</option>
                  {purchaseTaxes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input aria-label="Tax amount" inputMode="decimal" className={cn(inputClass, "w-32 tabular text-right")} value={t.amount} onChange={(e) => set({ taxes: v.taxes.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} />
                <button type="button" aria-label="Remove tax" className="rounded p-2 text-red-600 hover:bg-red-50 focus-ring" onClick={() => set({ taxes: v.taxes.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {purchaseTaxes.length ? (
              <Button size="sm" variant="secondary" onClick={() => set({ taxes: [...v.taxes, { taxTypeId: "", amount: "" }] })}><Plus className="h-4 w-4" aria-hidden="true" /> Add tax</Button>
            ) : (
              <p className="text-sm text-muted">No purchase tax types defined.</p>
            )}
            <FieldError name="taxes" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Receipt and notes" />
          <CardBody className="space-y-4">
            {receipt ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-subtle px-3 py-2 text-sm">
                <a href={receipt.url} target="_blank" rel="noopener" className="font-medium text-brand-700 hover:underline">{receipt.name}</a>
                <CheckboxField name="removeReceipt" label="Remove receipt" />
              </div>
            ) : null}
            <Field name="receipt" label={receipt ? "Replace receipt" : "Receipt"} type="file" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" hint="JPG, PNG, PDF or Office documents up to 20 MB." />
            <div>
              <Label htmlFor="e-notes">Notes</Label>
              <textarea id="e-notes" rows={4} maxLength={65000} className={inputClass} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </CardBody>
        </Card>
      </div>
      {customFields.length ? (
        <Card>
          <CardHeader title="Additional information" />
          <CardBody><CustomFieldInputs fields={customFields} values={customValues} isNew={isNew} /></CardBody>
        </Card>
      ) : null}
      <div className="flex justify-end gap-2">
        <ButtonLink href="/expenses" variant="secondary">Cancel</ButtonLink>
        <SubmitButton pendingLabel="Saving…">{isNew ? "Save expense" : "Update expense"}</SubmitButton>
      </div>
    </Form>
  );
}
