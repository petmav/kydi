"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FieldError, Form, Label, SubmitButton, useFormContext, type FormAction } from "@/components/form";
import { CustomFieldInputs, type CustomFieldInputDef } from "@/components/custom-field-inputs";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, inputClass } from "@/components/ui/primitives";
import { formatMoney, minorToInput, toMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

export type OpenInvoice = { id: number; number: string; date: string; dueDate: string | null; total: number; available: number; allocated: number };
type Row = { key: string; invoiceId: string; amount: string };
let seq = 0;
const key = () => `a${Date.now()}${seq++}`;

type Props = {
  action: FormAction;
  customers: { id: number; name: string; currency: string }[];
  methods: { id: number; name: string }[];
  notes: { id: number; name: string; notes: string }[];
  company: { currency: string; locale: string };
  initial: { customerId: number | null; paymentDate: string; paymentNumber: string; amount: string; exchangeRate: string; paymentMethodId: string; notes: string; allocations: { invoiceId: number; amount: string }[] };
  paymentId: number | null;
  invoicesAction: (customerId: number, paymentId: number | null) => Promise<OpenInvoice[]>;
  numberAction?: (customerId: number) => Promise<string>;
  rateAction: (currency: string) => Promise<number | null>;
  customFields: CustomFieldInputDef[];
  customValues?: Record<number, string | null>;
  cancelHref: string;
  lockCustomer: boolean;
};

export function PaymentForm(props: Props) {
  return (
    <Form action={props.action} className="space-y-6" data-tour="payment-form">
      <Body {...props} />
    </Form>
  );
}

function Body({ customers, methods, notes, company, initial, paymentId, invoicesAction, numberAction, rateAction, customFields, customValues, cancelHref, lockCustomer }: Props) {
  const { state } = useFormContext();
  const err = (k: string) => state?.fieldErrors?.[k]?.[0];
  const [customerId, setCustomerId] = useState<number | null>(initial.customerId);
  const [date, setDate] = useState(initial.paymentDate);
  const [number, setNumber] = useState(initial.paymentNumber);
  const [amount, setAmount] = useState(initial.amount);
  const [rate, setRate] = useState(initial.exchangeRate);
  const [methodId, setMethodId] = useState(initial.paymentMethodId);
  const [notesText, setNotesText] = useState(initial.notes);
  const [rows, setRows] = useState<Row[]>(initial.allocations.map((a) => ({ key: key(), invoiceId: String(a.invoiceId), amount: a.amount })));
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [loading, start] = useTransition();
  const customer = customers.find((c) => c.id === customerId);
  const currency = customer?.currency ?? company.currency;
  const foreign = !!customer && customer.currency !== company.currency;
  const money = (v: number) => formatMoney(v, currency, company.locale);
  const amountMinor = Number.isFinite(toMinor(amount)) ? toMinor(amount) : 0;
  const allocated = rows.reduce((s, r) => s + (Number.isFinite(toMinor(r.amount)) ? toMinor(r.amount) : 0), 0);

  useEffect(() => {
    if (!customerId) return setInvoices([]);
    start(async () => setInvoices(await invoicesAction(customerId, paymentId)));
    if (!paymentId && numberAction) start(async () => setNumber(await numberAction(customerId)));
    const c = customers.find((x) => x.id === customerId);
    if (c && c.currency !== company.currency && !rate) start(async () => { const r = await rateAction(c.currency); if (r) setRate(String(r)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const oldestFirst = () => {
    let left = amountMinor;
    const next: Row[] = [];
    for (const inv of invoices) {
      if (left <= 0) break;
      const take = Math.min(left, inv.available);
      if (take > 0) next.push({ key: key(), invoiceId: String(inv.id), amount: minorToInput(take) });
      left -= take;
    }
    setRows(next);
  };

  const payload = JSON.stringify({
    customerId,
    paymentDate: date,
    paymentNumber: number,
    amount,
    exchangeRate: foreign ? rate : 1,
    paymentMethodId: methodId || null,
    notes: notesText || null,
    allocations: rows.filter((r) => r.invoiceId).map((r) => ({ invoiceId: Number(r.invoiceId), amount: r.amount || "0" })),
  });

  return (
    <>
      <input type="hidden" name="payload" value={payload} />
      <Card>
        <CardHeader title="Payment details" />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="p-customer" required>Customer</Label>
            <select
              id="p-customer"
              className={inputClass}
              value={customerId ?? ""}
              disabled={lockCustomer}
              onChange={(e) => {
                setCustomerId(e.target.value ? Number(e.target.value) : null);
                setRows([]);
              }}
            >
              <option value="">Select a customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.currency !== company.currency ? ` (${c.currency})` : ""}</option>)}
            </select>
            {lockCustomer ? <p className="mt-1 text-xs text-muted">Remove allocations to change the customer.</p> : null}
            <FieldError name="customerId" />
          </div>
          <div>
            <Label htmlFor="p-date" required>Payment date</Label>
            <input id="p-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            <FieldError name="paymentDate" />
          </div>
          <div>
            <Label htmlFor="p-number" required>Payment number</Label>
            <input id="p-number" className={inputClass} value={number} onChange={(e) => setNumber(e.target.value)} />
            <FieldError name="paymentNumber" />
          </div>
          <div>
            <Label htmlFor="p-amount" required>Amount ({currency})</Label>
            <input id="p-amount" inputMode="decimal" className={cn(inputClass, "tabular text-right")} value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={err("amount") ? true : undefined} />
            <FieldError name="amount" />
          </div>
          <div>
            <Label htmlFor="p-method">Payment mode</Label>
            <select id="p-method" className={inputClass} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <option value="">Not specified</option>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <FieldError name="paymentMethodId" />
          </div>
          {foreign && customer ? (
            <div>
              <Label htmlFor="p-rate" required>Exchange rate</Label>
              <div className="flex items-center gap-2 text-sm">
                <span className="whitespace-nowrap">1 {customer.currency} =</span>
                <input id="p-rate" inputMode="decimal" className={cn(inputClass, "tabular")} value={rate} onChange={(e) => setRate(e.target.value)} />
                <span>{company.currency}</span>
              </div>
              <FieldError name="exchangeRate" />
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card data-tour="payment-allocation">
        <CardHeader
          title="Apply to invoices"
          description="Unallocated money stays on the customer's account as credit."
          actions={customerId && invoices.length ? <Button size="sm" variant="secondary" onClick={oldestFirst}>Allocate oldest first</Button> : null}
        />
        <CardBody className="space-y-3">
          {!customerId ? (
            <p className="text-sm text-muted">Select a customer to allocate this payment.</p>
          ) : loading && !invoices.length ? (
            <p className="text-sm text-muted">Loading open invoices…</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted">This customer has no open invoices.</p>
          ) : (
            <>
              {rows.map((r, i) => {
                const inv = invoices.find((x) => String(x.id) === r.invoiceId);
                return (
                  <div key={r.key} className="flex flex-wrap items-start gap-2">
                    <select aria-label={`Invoice for allocation ${i + 1}`} className={cn(inputClass, "max-w-xs")} value={r.invoiceId} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, invoiceId: e.target.value } : x)))}>
                      <option value="">Select invoice…</option>
                      {invoices.map((v) => (
                        <option key={v.id} value={v.id} disabled={rows.some((x) => x.key !== r.key && x.invoiceId === String(v.id))}>
                          {v.number} — due {money(v.available)}
                        </option>
                      ))}
                    </select>
                    <div>
                      <input aria-label={`Amount for allocation ${i + 1}`} inputMode="decimal" className={cn(inputClass, "w-36 tabular text-right")} value={r.amount} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))} />
                      {err(`allocations.${i}.amount`) ? <p className="mt-1 text-xs font-medium text-red-600">{err(`allocations.${i}.amount`)}</p> : null}
                    </div>
                    {inv ? <span className="pt-2 text-xs text-muted">Outstanding {money(inv.available)}</span> : null}
                    <button type="button" aria-label="Remove allocation" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="rounded p-2 text-red-600 hover:bg-red-50 focus-ring">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              <Button size="sm" variant="secondary" onClick={() => setRows((rs) => [...rs, { key: key(), invoiceId: "", amount: "" }])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add allocation
              </Button>
            </>
          )}
          <FieldError name="allocations" />
          <dl className="ml-auto grid max-w-xs grid-cols-2 gap-1 border-t border-line pt-3 text-sm">
            <dt className="text-muted">Allocated</dt>
            <dd className="tabular text-right">{money(allocated)}</dd>
            <dt className="text-muted">Unapplied credit</dt>
            <dd className={cn("tabular text-right", amountMinor - allocated < 0 && "font-semibold text-red-700")}>{money(amountMinor - allocated)}</dd>
          </dl>
          {amountMinor - allocated < 0 ? <p className="text-right text-xs font-medium text-red-700">Allocations exceed the payment amount.</p> : null}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Notes"
            actions={
              notes.length ? (
                <select aria-label="Insert saved note" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value="" onChange={(e) => { const n = notes.find((x) => String(x.id) === e.target.value); if (n) setNotesText((t) => (t ? `${t}\n${n.notes}` : n.notes)); }}>
                  <option value="">Insert note…</option>
                  {notes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              ) : null
            }
          />
          <CardBody>
            <label htmlFor="p-notes" className="sr-only">Notes</label>
            <textarea id="p-notes" rows={4} className={inputClass} value={notesText} onChange={(e) => setNotesText(e.target.value)} />
          </CardBody>
        </Card>
        {customFields.length ? (
          <Card>
            <CardHeader title="Additional information" />
            <CardBody>
              <CustomFieldInputs fields={customFields} values={customValues} isNew={!paymentId} />
            </CardBody>
          </Card>
        ) : null}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-line bg-white px-4 py-3 sm:mx-0 sm:rounded-md sm:border" data-tour="payment-save">
        <ButtonLink href={cancelHref} variant="secondary">Cancel</ButtonLink>
        <SubmitButton pendingLabel="Saving…" disabled={amountMinor - allocated < 0}>{paymentId ? "Update payment" : "Save payment"}</SubmitButton>
      </div>
    </>
  );
}
