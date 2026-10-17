"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Field, FieldError, Form, Label, SubmitButton, useFormContext, type FormAction } from "@/components/form";
import { CustomFieldInputs, type CustomFieldInputDef } from "@/components/custom-field-inputs";
import { ModalForm } from "@/components/modal";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, inputClass } from "@/components/ui/primitives";
import { RichTextEditor } from "@/components/rich-text-editor";
import { computeDocument, taxSummary, type TaxSpec } from "@/domain/totals";
import { FREQUENCY_PRESETS } from "@/domain/cron";
import { R, formatMoney, minorToInput, toMinor } from "@/lib/money";
import { addDaysIso } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type DocCustomer = { id: number; name: string; currency: string; email: string | null };
export type DocItem = { id: number; name: string; description: string | null; price: number; unitName: string | null; taxIds: number[]; fields?: Record<string, string> };
export type DocTax = { id: number; name: string; calculationType: "PERCENTAGE" | "FIXED"; percent: number | null; fixedAmount: number | null; compound: boolean };
export type LineState = { key: string; itemId: number | null; name: string; description: string; unitName: string; quantity: string; price: string; discountType: "FIXED" | "PERCENTAGE"; discount: string; taxes: number[]; customFields: Record<string, string> };
export type RecurringState = { startsAt: string; frequency: string; limitBy: "NONE" | "COUNT" | "DATE"; limitCount: string; limitDate: string; status: "ACTIVE" | "ON_HOLD" | "COMPLETED"; sendAutomatically: boolean; notifyCreator: boolean };
export type DocInitial = {
  customerId: number | null;
  date: string;
  /** "HH:MM" when invoices carry a time (invoice_use_time). */
  time?: string;
  closingDate: string;
  number: string;
  referenceNumber: string;
  exchangeRate: string;
  discountType: "FIXED" | "PERCENTAGE";
  discount: string;
  taxIncluded: boolean;
  notes: string;
  templateName: string;
  taxes: number[];
  lines: LineState[];
  recurring?: RecurringState;
};

let keySeq = 0;
const newKey = () => `l${Date.now()}-${keySeq++}`;
export const emptyLine = (): LineState => ({ key: newKey(), itemId: null, name: "", description: "", unitName: "", quantity: "1", price: "", discountType: "FIXED", discount: "", taxes: [], customFields: {} });

const LABELS = {
  invoice: { date: "Invoice date", closing: "Due date", number: "Invoice number", save: "Save invoice", notesType: "Invoice" },
  estimate: { date: "Estimate date", closing: "Expiry date", number: "Estimate number", save: "Save estimate", notesType: "Estimate" },
  recurring: { date: "", closing: "", number: "", save: "Save recurring invoice", notesType: "Invoice" },
};

const TEMPLATE_LABELS: Record<string, string> = { "1": "Centered header", "2": "Title header", "3": "Split header" };

function TemplateThumb({ variant }: { variant: string }) {
  return (
    <svg viewBox="0 0 60 78" className="h-16 w-12 rounded-sm border border-line bg-white" aria-hidden="true">
      {variant === "1" ? (
        <>
          <rect x="22" y="5" width="16" height="5" fill="#94a3b8" />
          <line x1="5" y1="14" x2="55" y2="14" stroke="#cbd5e1" />
          <rect x="5" y="18" width="18" height="8" fill="#e2e8f0" />
          <rect x="37" y="18" width="18" height="8" fill="#e2e8f0" />
        </>
      ) : variant === "2" ? (
        <>
          <rect x="5" y="5" width="12" height="8" fill="#94a3b8" />
          <rect x="35" y="5" width="20" height="5" fill="#475569" />
          <line x1="5" y1="16" x2="55" y2="16" stroke="#64748b" strokeWidth="1.5" />
          <rect x="5" y="20" width="18" height="8" fill="#e2e8f0" />
          <rect x="37" y="20" width="18" height="8" fill="#e2e8f0" />
        </>
      ) : (
        <>
          <rect x="5" y="5" width="12" height="8" fill="#94a3b8" />
          <rect x="37" y="5" width="18" height="8" fill="#e2e8f0" />
          <line x1="5" y1="16" x2="55" y2="16" stroke="#cbd5e1" />
          <rect x="5" y="20" width="18" height="8" fill="#e2e8f0" />
          <rect x="37" y="20" width="18" height="8" fill="#cbd5e1" />
        </>
      )}
      {[34, 40, 46, 52].map((y) => (
        <line key={y} x1="5" y1={y} x2="55" y2={y} stroke="#e2e8f0" />
      ))}
      <rect x="35" y="60" width="20" height="8" fill="none" stroke="#94a3b8" />
    </svg>
  );
}

function LineFieldInput({ field, value, onChange, label }: { field: CustomFieldInputDef; value: string; onChange: (v: string) => void; label: string }) {
  const cls = cn(inputClass, "py-1 text-xs");
  if (field.type === "Dropdown")
    return (
      <select aria-label={label} className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  if (field.type === "Switch") return <input type="checkbox" aria-label={label} className="h-4 w-4 accent-brand-700" checked={value === "1"} onChange={(e) => onChange(e.target.checked ? "1" : "")} />;
  const type = field.type === "Date" ? "date" : field.type === "Time" ? "time" : field.type === "DateTime" ? "datetime-local" : "text";
  return <input aria-label={label} type={type} inputMode={field.type === "Number" ? "decimal" : undefined} className={cls} value={value} placeholder={field.placeholder ?? undefined} maxLength={255} onChange={(e) => onChange(e.target.value)} />;
}

function LineErrors({ i }: { i: number }) {
  const { state } = useFormContext();
  const errs = ["name", "quantity", "price", "discount", "taxes", "customFields"].map((f) => state?.fieldErrors?.[`lines.${i}.${f}`]?.[0]).filter(Boolean);
  if (!errs.length) return null;
  return <p className="mt-1 text-xs font-medium text-red-600">{errs.join(" ")}</p>;
}

type DocumentFormProps = Parameters<typeof DocumentFormBody>[0];

export function DocumentForm(props: DocumentFormProps) {
  return (
    <Form action={props.action} className="space-y-6">
      <DocumentFormBody {...props} />
    </Form>
  );
}

function DocumentFormBody({
  kind,
  action: _action,
  customers: initialCustomers,
  items: initialItems,
  taxTypes,
  notes,
  company,
  initial,
  numberAction,
  rateAction,
  previewAction,
  customerAction,
  itemAction,
  customFields,
  customValues,
  isNew,
  cancelHref,
  allowSend,
  lineFields = [],
  useTime = false,
  allowRecurring = false,
}: {
  kind: "invoice" | "estimate" | "recurring";
  action: FormAction;
  customers: DocCustomer[];
  items: DocItem[];
  taxTypes: DocTax[];
  notes: { id: number; name: string; notes: string }[];
  company: { currency: string; locale: string; taxPerItem: boolean; discountPerItem: boolean; taxIncludedEnabled: boolean; autoClosing: boolean; closingDays: number };
  initial: DocInitial;
  numberAction?: (customerId: number) => Promise<string>;
  rateAction: (currency: string) => Promise<number | null>;
  previewAction?: (frequency: string, startsAt: string) => Promise<{ dates: string[]; error?: string }>;
  customerAction?: FormAction;
  itemAction?: FormAction;
  customFields: CustomFieldInputDef[];
  customValues?: Record<number, string | null>;
  isNew: boolean;
  cancelHref: string;
  allowSend: boolean;
  /** Item custom fields with placement "document", entered per line (spec §5.4 items table). */
  lineFields?: CustomFieldInputDef[];
  useTime?: boolean;
  /** Shows the "Make recurring" switch on new invoices (spec §5.4 header actions). */
  allowRecurring?: boolean;
}) {
  void _action;
  const { state: formState } = useFormContext();
  const err = (k: string) => formState?.fieldErrors?.[k]?.[0];
  const [customers, setCustomers] = useState(initialCustomers);
  const [items, setItems] = useState(initialItems);
  const [customerId, setCustomerId] = useState<number | null>(initial.customerId);
  const [date, setDate] = useState(initial.date);
  const [closingDate, setClosingDate] = useState(initial.closingDate);
  const [closingTouched, setClosingTouched] = useState(!isNew);
  const [number, setNumber] = useState(initial.number);
  const [referenceNumber, setReferenceNumber] = useState(initial.referenceNumber);
  const [exchangeRate, setExchangeRate] = useState(initial.exchangeRate);
  const [discountType, setDiscountType] = useState(initial.discountType);
  const [discount, setDiscount] = useState(initial.discount);
  const [taxIncluded, setTaxIncluded] = useState(initial.taxIncluded);
  const [docTaxes, setDocTaxes] = useState<number[]>(initial.taxes);
  const [lines, setLines] = useState<LineState[]>(initial.lines.length ? initial.lines : [emptyLine()]);
  const [notesText, setNotesText] = useState(initial.notes);
  const [templateName, setTemplateName] = useState(initial.templateName);
  const [rec, setRec] = useState<RecurringState | undefined>(initial.recurring);
  const [preview, setPreview] = useState<{ dates: string[]; error?: string } | null>(null);
  const [time, setTime] = useState(initial.time ?? "");
  const [makeRecurring, setMakeRecurring] = useState(false);
  const effKind = kind === "invoice" && makeRecurring ? "recurring" : kind;
  const L = LABELS[effKind];
  const toggleRecurring = (on: boolean) => {
    setMakeRecurring(on);
    if (on && !rec) setRec({ startsAt: date, frequency: "0 0 1 * *", limitBy: "NONE", limitCount: "", limitDate: "", status: "ACTIVE", sendAutomatically: false, notifyCreator: false });
  };
  const [, start] = useTransition();

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const currency = customer?.currency ?? company.currency;
  const foreign = !!customer && customer.currency !== company.currency;
  const rate = foreign ? Number(exchangeRate) || 0 : 1;
  const money = (v: number) => formatMoney(v, currency, company.locale);
  const taxById = useMemo(() => new Map(taxTypes.map((t) => [t.id, t])), [taxTypes]);
  const spec = (id: number): TaxSpec | null => {
    const t = taxById.get(id);
    return t ? { taxTypeId: t.id, name: t.name, calculationType: t.calculationType, percent: t.percent, fixedAmount: t.fixedAmount, compound: t.compound } : null;
  };

  const result = useMemo(() => {
    const m = (v: string) => (Number.isFinite(toMinor(v)) ? toMinor(v) : 0);
    return computeDocument({
      lines: lines.map((l) => ({
        price: m(l.price),
        quantity: Number(l.quantity) || 0,
        discountType: l.discountType,
        discount: l.discountType === "PERCENTAGE" ? Number(l.discount) || 0 : m(l.discount),
        taxes: l.taxes.map(spec).filter((x): x is TaxSpec => !!x),
      })),
      discountPerItem: company.discountPerItem,
      taxPerItem: company.taxPerItem,
      taxIncluded: company.taxIncludedEnabled && taxIncluded,
      discountType,
      discount: discountType === "PERCENTAGE" ? Number(discount) || 0 : m(discount),
      taxes: company.taxPerItem ? [] : docTaxes.map(spec).filter((x): x is TaxSpec => !!x),
      exchangeRate: rate || 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, discount, discountType, docTaxes, taxIncluded, rate, company, taxById]);

  // Suggest number + exchange rate when the customer changes on new documents.
  useEffect(() => {
    if (!customer) return;
    if (isNew && numberAction) start(async () => setNumber(await numberAction(customer.id)));
    if (customer.currency !== company.currency && (isNew || !exchangeRate)) {
      start(async () => {
        const r = await rateAction(customer.currency);
        if (r) setExchangeRate(String(r));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const onDateChange = (v: string) => {
    setDate(v);
    if (company.autoClosing && !closingTouched && v) setClosingDate(addDaysIso(v, company.closingDays));
  };

  const updateLine = (key: string, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickItem = (key: string, itemId: string) => {
    const it = items.find((i) => String(i.id) === itemId);
    if (!it) return updateLine(key, { itemId: null });
    const price = foreign && rate > 0 ? R(it.price / rate) : it.price;
    updateLine(key, { itemId: it.id, name: it.name, description: it.description ?? "", unitName: it.unitName ?? "", price: minorToInput(price), taxes: company.taxPerItem ? it.taxIds.filter((t) => taxById.has(t)) : [], customFields: { ...(it.fields ?? {}) } });
  };
  const move = (i: number, d: -1 | 1) =>
    setLines((ls) => {
      const n = [...ls];
      const j = i + d;
      if (j < 0 || j >= n.length) return ls;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const payload = JSON.stringify({
    customerId,
    date,
    time: useTime && effKind === "invoice" ? time || null : null,
    closingDate: closingDate || null,
    number,
    referenceNumber: referenceNumber || null,
    exchangeRate: foreign ? exchangeRate : 1,
    discountType,
    discount: discount || 0,
    taxIncluded: company.taxIncludedEnabled && taxIncluded,
    notes: notesText || null,
    templateName,
    taxes: company.taxPerItem ? [] : docTaxes,
    lines: lines.map((l) => ({
      itemId: l.itemId,
      name: l.name,
      description: l.description || null,
      unitName: l.unitName || null,
      quantity: l.quantity,
      price: l.price,
      discountType: l.discountType,
      discount: l.discount || 0,
      taxes: company.taxPerItem ? l.taxes : [],
      customFields: lineFields.length ? l.customFields : null,
    })),
    recurring: effKind === "recurring" ? rec : undefined,
    makeRecurring: kind === "invoice" && effKind === "recurring",
  });

  const summary = taxSummary(result, company.taxPerItem);
  const prefix = kind === "recurring" ? "invoice" : kind;

  return (
    <>
      <input type="hidden" name="payload" value={payload} />
      {allowRecurring && kind === "invoice" && isNew ? (
        <div className="flex items-center justify-end">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-ink-2">
            <input type="checkbox" role="switch" aria-checked={makeRecurring} checked={makeRecurring} onChange={(e) => toggleRecurring(e.target.checked)} className="h-4 w-4 accent-brand-700" />
            Make recurring
          </label>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader
            title="Customer"
            actions={
              customerAction ? (
                <ModalForm
                  trigger="Add new"
                  title="New customer"
                  action={customerAction}
                  variant="secondary"
                  size="sm"
                  onSuccess={(s) => {
                    const c = s.data?.customer as DocCustomer | undefined;
                    if (c) {
                      setCustomers((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)));
                      setCustomerId(c.id);
                    }
                  }}
                >
                  <Field name="name" label="Display name" required autoFocus />
                  <Field name="email" label="Email" type="email" />
                  <Field name="currency" label="Currency (ISO code)" required defaultValue={company.currency} maxLength={3} />
                </ModalForm>
              ) : null
            }
          />
          <CardBody>
            <Label htmlFor="doc-customer" required>
              Customer
            </Label>
            <select
              id="doc-customer"
              className={inputClass}
              value={customerId ?? ""}
              onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}
              aria-invalid={err("customerId") ? true : undefined}
            >
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.currency !== company.currency ? ` (${c.currency})` : ""}
                </option>
              ))}
            </select>
            <FieldError name="customerId" />
            {customer ? (
              <p className="mt-2 text-xs text-muted">
                {customer.email ?? "No email on file"} · {customer.currency}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {effKind === "recurring" && rec ? (
              <>
                <div>
                  <Label htmlFor="rec-start" required>Starts at</Label>
                  <input id="rec-start" type="date" className={inputClass} value={rec.startsAt} onChange={(e) => setRec({ ...rec, startsAt: e.target.value })} />
                  <FieldError name="startsAt" />
                </div>
                <div>
                  <Label htmlFor="rec-freq" required>Frequency</Label>
                  <select
                    id="rec-freq"
                    className={inputClass}
                    value={FREQUENCY_PRESETS.some((p) => p.value === rec.frequency) ? rec.frequency : "custom"}
                    onChange={(e) => setRec({ ...rec, frequency: e.target.value === "custom" ? "0 9 * * 1" : e.target.value })}
                  >
                    {FREQUENCY_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                    <option value="custom">Custom (cron expression)</option>
                  </select>
                </div>
                {!FREQUENCY_PRESETS.some((p) => p.value === rec.frequency) ? (
                  <div>
                    <Label htmlFor="rec-cron" required>Cron expression</Label>
                    <input id="rec-cron" className={cn(inputClass, "font-mono")} value={rec.frequency} onChange={(e) => setRec({ ...rec, frequency: e.target.value })} />
                    <p className="mt-1 text-xs text-muted">minute hour day-of-month month day-of-week, in the company time zone.</p>
                  </div>
                ) : null}
                <FieldError name="frequency" />
                <div className="sm:col-span-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => previewAction && start(async () => setPreview(await previewAction(rec.frequency, rec.startsAt)))}
                  >
                    Preview next invoice dates
                  </Button>
                  {preview ? (
                    preview.error ? (
                      <p className="mt-2 text-sm text-red-700">{preview.error}</p>
                    ) : (
                      <ol className="mt-2 list-decimal pl-5 text-sm text-ink-2">
                        {preview.dates.map((d) => <li key={d}>{d}</li>)}
                      </ol>
                    )
                  ) : null}
                </div>
                <div>
                  <Label htmlFor="rec-limit">Limit by</Label>
                  <select id="rec-limit" className={inputClass} value={rec.limitBy} onChange={(e) => setRec({ ...rec, limitBy: e.target.value as RecurringState["limitBy"] })}>
                    <option value="NONE">None</option>
                    <option value="COUNT">Number of invoices</option>
                    <option value="DATE">End date</option>
                  </select>
                </div>
                {rec.limitBy === "COUNT" ? (
                  <div>
                    <Label htmlFor="rec-count" required>Limit count</Label>
                    <input id="rec-count" type="number" min={1} max={10000} className={inputClass} value={rec.limitCount} onChange={(e) => setRec({ ...rec, limitCount: e.target.value })} />
                    <FieldError name="limitCount" />
                  </div>
                ) : rec.limitBy === "DATE" ? (
                  <div>
                    <Label htmlFor="rec-ldate" required>Limit date</Label>
                    <input id="rec-ldate" type="date" className={inputClass} value={rec.limitDate} onChange={(e) => setRec({ ...rec, limitDate: e.target.value })} />
                    <FieldError name="limitDate" />
                  </div>
                ) : <div />}
                <div>
                  <Label htmlFor="rec-status">Status</Label>
                  <select id="rec-status" className={inputClass} value={rec.status} onChange={(e) => setRec({ ...rec, status: e.target.value as RecurringState["status"] })}>
                    <option value="ACTIVE">Active</option>
                    <option value="ON_HOLD">On hold</option>
                    {rec.status === "COMPLETED" ? <option value="COMPLETED">Completed</option> : null}
                  </select>
                </div>
                <div className="flex flex-col justify-end gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={rec.sendAutomatically} onChange={(e) => setRec({ ...rec, sendAutomatically: e.target.checked })} className="h-4 w-4 accent-brand-700" />
                    Send automatically to the customer
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={rec.notifyCreator} onChange={(e) => setRec({ ...rec, notifyCreator: e.target.checked })} className="h-4 w-4 accent-brand-700" />
                    Notify me on each run
                  </label>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="doc-date" required>{L.date}</Label>
                  <input id="doc-date" type="date" className={inputClass} value={date} onChange={(e) => onDateChange(e.target.value)} aria-invalid={err("date") ? true : undefined} />
                  <FieldError name="date" />
                </div>
                {useTime && effKind === "invoice" ? (
                  <div>
                    <Label htmlFor="doc-time">Invoice time</Label>
                    <input id="doc-time" type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
                    <FieldError name="time" />
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="doc-closing">{L.closing}</Label>
                  <input
                    id="doc-closing"
                    type="date"
                    className={inputClass}
                    value={closingDate}
                    onChange={(e) => {
                      setClosingTouched(true);
                      setClosingDate(e.target.value);
                    }}
                  />
                  <FieldError name="closingDate" />
                </div>
                <div>
                  <Label htmlFor="doc-number" required>{L.number}</Label>
                  <input id="doc-number" className={inputClass} value={number} maxLength={255} onChange={(e) => setNumber(e.target.value)} aria-invalid={err("number") ? true : undefined} />
                  <FieldError name="number" />
                </div>
                <div>
                  <Label htmlFor="doc-ref">Reference number</Label>
                  <input id="doc-ref" className={inputClass} value={referenceNumber} maxLength={255} onChange={(e) => setReferenceNumber(e.target.value)} />
                </div>
              </>
            )}
            {foreign && customer ? (
              <div className="sm:col-span-2">
                <Label htmlFor="doc-rate" required>Exchange rate</Label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="whitespace-nowrap">1 {customer.currency} =</span>
                  <input id="doc-rate" inputMode="decimal" className={cn(inputClass, "max-w-[10rem] tabular")} value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
                  <span>{company.currency}</span>
                  <Button size="sm" variant="ghost" onClick={() => start(async () => { const r = await rateAction(customer.currency); if (r) setExchangeRate(String(r)); })}>
                    Use last rate
                  </Button>
                </div>
                <FieldError name="exchangeRate" />
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Items"
          actions={
            itemAction ? (
              <ModalForm
                trigger="New catalogue item"
                title="New item"
                action={itemAction}
                variant="secondary"
                size="sm"
                onSuccess={(s) => {
                  const it = s.data?.item as { id: number; name: string; description: string | null; price: number; unit: { name: string } | null; taxes: { taxTypeId: number }[] } | undefined;
                  if (it) setItems((xs) => [...xs, { id: it.id, name: it.name, description: it.description, price: it.price, unitName: it.unit?.name ?? null, taxIds: it.taxes.map((t) => t.taxTypeId), fields: {} }]);
                }}
              >
                <Field name="name" label="Name" required autoFocus />
                <Field name="price" label={`Price (${company.currency})`} required inputMode="decimal" />
                <Field name="description" label="Description" />
              </ModalForm>
            ) : null
          }
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-subtle text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-semibold">Item</th>
                <th scope="col" className="w-24 px-2 py-2 text-right font-semibold">Quantity</th>
                <th scope="col" className="w-32 px-2 py-2 text-right font-semibold">Price</th>
                {company.discountPerItem ? <th scope="col" className="w-40 px-2 py-2 text-right font-semibold">Discount</th> : null}
                <th scope="col" className="w-32 px-2 py-2 text-right font-semibold">Amount</th>
                <th scope="col" className="w-24 px-2 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l, i) => (
                <tr key={l.key} className="align-top">
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <select aria-label={`Catalogue item for line ${i + 1}`} className={cn(inputClass, "max-w-[12rem]")} value={l.itemId ?? ""} onChange={(e) => pickItem(l.key, e.target.value)}>
                        <option value="">Custom line</option>
                        {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                      </select>
                      <input aria-label={`Name for line ${i + 1}`} placeholder="Item name" className={inputClass} value={l.name} maxLength={255} onChange={(e) => updateLine(l.key, { name: e.target.value })} aria-invalid={err(`lines.${i}.name`) ? true : undefined} />
                    </div>
                    <textarea aria-label={`Description for line ${i + 1}`} placeholder="Description (optional)" rows={1} className={cn(inputClass, "mt-2 text-xs")} value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} />
                    {lineFields.length ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {lineFields.map((f) => (
                          <div key={f.id} className="text-xs text-muted">
                            <span className="mb-0.5 block">{f.label}</span>
                            <LineFieldInput field={f} label={`${f.label} for line ${i + 1}`} value={l.customFields[String(f.id)] ?? ""} onChange={(v) => updateLine(l.key, { customFields: { ...l.customFields, [String(f.id)]: v } })} />
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {company.taxPerItem ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {l.taxes.map((tid) => {
                          const t = taxById.get(tid);
                          const amount = result.lines[i]?.taxes.find((x) => x.taxTypeId === tid)?.amount ?? 0;
                          return (
                            <span key={tid} className="inline-flex items-center gap-1 rounded border border-line bg-subtle px-2 py-0.5 text-xs">
                              {t?.name} {t?.calculationType === "PERCENTAGE" ? `${t.percent}%` : ""} · <span className="tabular">{money(amount)}</span>
                              <button type="button" aria-label={`Remove ${t?.name}`} className="text-slate-500 hover:text-red-700" onClick={() => updateLine(l.key, { taxes: l.taxes.filter((x) => x !== tid) })}>×</button>
                            </span>
                          );
                        })}
                        <select
                          aria-label={`Add tax to line ${i + 1}`}
                          className="rounded border border-line px-1 py-0.5 text-xs"
                          value=""
                          onChange={(e) => e.target.value && updateLine(l.key, { taxes: [...l.taxes, Number(e.target.value)] })}
                        >
                          <option value="">+ Add tax</option>
                          {taxTypes.filter((t) => !l.taxes.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                    ) : null}
                    <LineErrors i={i} />
                  </td>
                  <td className="px-2 py-3">
                    <input aria-label={`Quantity for line ${i + 1}`} inputMode="decimal" className={cn(inputClass, "tabular text-right")} value={l.quantity} maxLength={20} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} />
                    {l.unitName ? <p className="mt-1 text-right text-xs text-muted">{l.unitName}</p> : null}
                  </td>
                  <td className="px-2 py-3">
                    <input aria-label={`Price for line ${i + 1}`} inputMode="decimal" className={cn(inputClass, "tabular text-right")} value={l.price} maxLength={20} placeholder="0.00" onChange={(e) => updateLine(l.key, { price: e.target.value })} />
                  </td>
                  {company.discountPerItem ? (
                    <td className="px-2 py-3">
                      <div className="flex">
                        <input aria-label={`Discount for line ${i + 1}`} inputMode="decimal" className={cn(inputClass, "rounded-r-none tabular text-right")} value={l.discount} placeholder="0" onChange={(e) => updateLine(l.key, { discount: e.target.value })} />
                        <select aria-label={`Discount type for line ${i + 1}`} className="rounded-r-md border border-l-0 border-slate-300 bg-subtle px-1 text-xs" value={l.discountType} onChange={(e) => updateLine(l.key, { discountType: e.target.value as LineState["discountType"] })}>
                          <option value="FIXED">{currency}</option>
                          <option value="PERCENTAGE">%</option>
                        </select>
                      </div>
                    </td>
                  ) : null}
                  <td className="tabular px-2 py-3 pt-5 text-right font-medium">{money(result.lines[i]?.total ?? 0)}</td>
                  <td className="px-2 py-3">
                    <div className="flex justify-end gap-0.5">
                      <button type="button" aria-label="Move line up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-500 hover:bg-subtle disabled:opacity-30 focus-ring"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" aria-label="Move line down" disabled={i === lines.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-500 hover:bg-subtle disabled:opacity-30 focus-ring"><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30 focus-ring"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-4 py-3">
          <Button size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add line
          </Button>
          <FieldError name="lines" />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
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
              <label htmlFor="doc-notes" className="sr-only">Notes</label>
              <RichTextEditor id="doc-notes" label="Notes" value={notesText} onChange={setNotesText} rows={5} placeholder="Payment terms, bank details or a thank-you note. Placeholders such as {CONTACT_DISPLAY_NAME} are supported." />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="PDF template" />
            <CardBody>
              <fieldset className="flex flex-wrap gap-3">
                <legend className="sr-only">PDF template</legend>
                {["1", "2", "3"].map((v) => {
                  const name = `${prefix}${v}`;
                  return (
                    <label key={v} className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-xs", templateName === name ? "border-brand-700 ring-1 ring-brand-700" : "border-line hover:border-slate-400")}>
                      <input type="radio" name="templatePick" value={name} checked={templateName === name} onChange={() => setTemplateName(name)} className="sr-only" />
                      <TemplateThumb variant={v} />
                      {TEMPLATE_LABELS[v]}
                    </label>
                  );
                })}
              </fieldset>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" name="makeDefaultTemplate" className="h-4 w-4 accent-brand-700" /> Use as my default template
              </label>
            </CardBody>
          </Card>
          {customFields.length ? (
            <Card>
              <CardHeader title="Additional information" />
              <CardBody>
                <CustomFieldInputs fields={customFields} values={customValues} isNew={isNew} />
              </CardBody>
            </Card>
          ) : null}
        </div>
        <Card className="self-start">
          <CardHeader title="Totals" />
          <CardBody className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular">{money(result.subTotal)}</span></div>
            {!company.discountPerItem ? (
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="doc-discount" className="text-muted">Discount</label>
                <div className="flex items-center gap-2">
                  <div className="flex">
                    <input id="doc-discount" inputMode="decimal" className={cn(inputClass, "w-24 rounded-r-none py-1 tabular text-right")} value={discount} placeholder="0" onChange={(e) => setDiscount(e.target.value)} />
                    <select aria-label="Discount type" className="rounded-r-md border border-l-0 border-slate-300 bg-subtle px-1 text-xs" value={discountType} onChange={(e) => setDiscountType(e.target.value as "FIXED" | "PERCENTAGE")}>
                      <option value="FIXED">{currency}</option>
                      <option value="PERCENTAGE">%</option>
                    </select>
                  </div>
                  <span className="tabular w-28 text-right">−{money(result.discountVal)}</span>
                </div>
              </div>
            ) : null}
            <FieldError name="discount" />
            {company.taxPerItem ? (
              summary.map((t) => (
                <div key={t.name + t.percent} className="flex justify-between"><span className="text-muted">{t.name}{t.percent !== null ? ` (${t.percent}%)` : ""}</span><span className="tabular">{money(t.amount)}</span></div>
              ))
            ) : (
              <>
                {docTaxes.map((tid) => {
                  const t = taxById.get(tid);
                  const row = result.taxes.find((x) => x.taxTypeId === tid);
                  return (
                    <div key={tid} className="flex items-center justify-between">
                      <span className="text-muted">
                        {t?.name}{t?.calculationType === "PERCENTAGE" ? ` (${t.percent}%)` : ""}{t?.compound ? " · compound" : ""}
                        <button type="button" className="ml-2 text-xs text-red-700 hover:underline" onClick={() => setDocTaxes((d) => d.filter((x) => x !== tid))}>Remove</button>
                      </span>
                      <span className="tabular">{money(row?.amount ?? 0)}</span>
                    </div>
                  );
                })}
                <select aria-label="Add tax" className="rounded-md border border-slate-300 px-2 py-1 text-sm" value="" onChange={(e) => e.target.value && setDocTaxes((d) => [...d, Number(e.target.value)])}>
                  <option value="">+ Add tax</option>
                  {taxTypes.filter((t) => !docTaxes.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <FieldError name="taxes" />
              </>
            )}
            {company.taxIncludedEnabled ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={taxIncluded} onChange={(e) => setTaxIncluded(e.target.checked)} className="h-4 w-4 accent-brand-700" /> Prices include tax
              </label>
            ) : null}
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{money(result.total)}</span>
            </div>
            {foreign && rate > 0 ? <p className="text-right text-xs text-muted">≈ {formatMoney(result.baseTotal, company.currency, company.locale)}</p> : null}
            <FieldError name="total" />
          </CardBody>
        </Card>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-line bg-white px-4 py-3 sm:mx-0 sm:rounded-md sm:border">
        <ButtonLink href={cancelHref} variant="secondary">Cancel</ButtonLink>
        {allowSend && effKind !== "recurring" ? (
          <SubmitButton name="intent" value="send" variant="secondary" pendingLabel="Saving…">
            Save and send
          </SubmitButton>
        ) : null}
        <SubmitButton name="intent" value="save" pendingLabel="Saving…">{L.save}</SubmitButton>
      </div>
    </>
  );
}
