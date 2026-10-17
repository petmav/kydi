"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FieldError, Form, Label, SubmitButton, useFieldError, type FormAction } from "@/components/form";
import { Card, CardBody, CardHeader, inputClass } from "@/components/ui/primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import { RichTextEditor } from "@/components/rich-text-editor";
import { computeBill } from "@/domain/purchasing";
import { formatMoney, toMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Client forms for bills, supplier credits, supplier payments and credit allocations (spec §5.9). */

export type SupplierOpt = { id: number; name: string; currency: string; enabled: boolean; paymentTerms: number; expenseCategoryId: number | null };
export type TaxOpt = { id: number; name: string; calculationType: "PERCENTAGE" | "FIXED"; percent: number | null; fixedAmount: number | null; compound: boolean };
export type LineState = { expenseCategoryId: string; description: string; quantity: string; price: string; discountType: "PERCENTAGE" | "FIXED"; discount: string; taxTypeIds: number[]; sourceBillLineId?: number | null };
export type OpenBill = { id: number; supplierId: number; number: string; currency: string; due: number; dueDate: string | null; documentDate: string };

const emptyLine = (categoryId: string): LineState => ({ expenseCategoryId: categoryId, description: "", quantity: "1", price: "", discountType: "PERCENTAGE", discount: "0", taxTypeIds: [] });

function Err({ name }: { name: string }) {
  const e = useFieldError(name);
  return e ? <p className="mt-1 text-xs font-medium text-red-600">{e}</p> : null;
}

function TextInput({ id, label, value, onChange, required, type = "text", disabled, name, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string; disabled?: boolean; name: string; hint?: string }) {
  const err = useFieldError(name);
  return (
    <div>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <input id={id} type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-invalid={err ? true : undefined} className={inputClass} />
      {err ? <p className="mt-1 text-xs font-medium text-red-600">{err}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function BillForm({
  type,
  action,
  suppliers,
  categories,
  taxes,
  baseCurrency,
  locale,
  rates,
  initial,
  locked = false,
  status,
  cancelHref,
}: {
  type: "BILL" | "SUPPLIER_CREDIT";
  action: FormAction;
  suppliers: SupplierOpt[];
  categories: { id: number; name: string }[];
  taxes: TaxOpt[];
  baseCurrency: string;
  locale: string;
  rates: Record<string, number>;
  initial: { supplierId: string; number: string; reference: string; documentDate: string; dueDate: string; exchangeRate: string; taxIncluded: boolean; notes: string; sourceBillId: number | null; lines: LineState[] };
  locked?: boolean;
  status: "NEW" | "DRAFT" | "OPEN";
  cancelHref: string;
}) {
  const [f, setF] = useState(initial);
  const set = <K extends keyof typeof initial>(k: K, v: (typeof initial)[K]) => setF((p) => ({ ...p, [k]: v }));
  const supplier = suppliers.find((s) => String(s.id) === f.supplierId);
  const currency = supplier?.currency ?? baseCurrency;
  const foreign = currency !== baseCurrency;
  const credit = type === "SUPPLIER_CREDIT";

  const result = useMemo(() => {
    const rate = foreign ? Number(f.exchangeRate) || 1 : 1;
    return computeBill(
      f.lines.map((l) => ({
        expenseCategoryId: Number(l.expenseCategoryId),
        description: l.description,
        quantity: Number(l.quantity) || 0,
        price: toMinor(l.price || "0"),
        discountType: l.discountType,
        discount: l.discountType === "FIXED" ? toMinor(l.discount || "0") : Number(l.discount) || 0,
        taxes: l.taxTypeIds.map((id) => taxes.find((t) => t.id === id)).filter((t): t is TaxOpt => !!t).map((t) => ({ taxTypeId: t.id, name: t.name, calculationType: t.calculationType, percent: t.percent, fixedAmount: t.fixedAmount, compound: t.compound })),
      })),
      f.taxIncluded,
      rate,
    );
  }, [f.lines, f.taxIncluded, f.exchangeRate, foreign, taxes]);

  const money = (v: number) => formatMoney(v, currency, locale);
  const setLine = (i: number, patch: Partial<LineState>) => setF((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const payload = JSON.stringify({ ...f, type, supplierId: f.supplierId, sourceBillId: f.sourceBillId, exchangeRate: foreign ? f.exchangeRate : 1, lines: f.lines.map((l) => ({ ...l, expenseCategoryId: Number(l.expenseCategoryId) })) });

  return (
    <Form action={action} className="space-y-6" showErrorSummary>
      <input type="hidden" name="payload" value={payload} />
      <Card>
        <CardHeader title={credit ? "Supplier credit" : "Bill"} description={locked ? "This document has payments or credits, so only the reference, due date and notes can change." : undefined} />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="b-supplier" required>
              Supplier
            </Label>
            <select
              id="b-supplier"
              value={f.supplierId}
              disabled={locked || !!f.sourceBillId}
              onChange={(e) => {
                const s = suppliers.find((x) => String(x.id) === e.target.value);
                setF((p) => ({
                  ...p,
                  supplierId: e.target.value,
                  exchangeRate: s && s.currency !== baseCurrency ? String(rates[s.currency] ?? "") : "1",
                  lines: p.lines.map((l) => (l.expenseCategoryId ? l : { ...l, expenseCategoryId: s?.expenseCategoryId ? String(s.expenseCategoryId) : "" })),
                }));
              }}
              className={inputClass}
            >
              <option value="">Choose a supplier</option>
              {suppliers.filter((s) => s.enabled || String(s.id) === initial.supplierId).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.currency})
                </option>
              ))}
            </select>
            <Err name="supplierId" />
          </div>
          <TextInput id="b-number" name="number" label={credit ? "Credit number" : "Bill number"} value={f.number} onChange={(v) => set("number", v)} disabled={locked || status !== "NEW"} hint={status === "NEW" ? "Leave blank to use the next number." : undefined} />
          <TextInput id="b-ref" name="reference" label="Reference" value={f.reference} onChange={(v) => set("reference", v)} hint={credit ? undefined : "The supplier's invoice number."} />
          <TextInput id="b-date" name="documentDate" label={credit ? "Credit date" : "Bill date"} type="date" required value={f.documentDate} onChange={(v) => set("documentDate", v)} disabled={locked} />
          {!credit ? <TextInput id="b-due" name="dueDate" label="Due date" type="date" value={f.dueDate} onChange={(v) => set("dueDate", v)} hint={supplier ? `Blank = bill date + ${supplier.paymentTerms} days.` : undefined} /> : null}
          {foreign ? <TextInput id="b-rate" name="exchangeRate" label={`Exchange rate (1 ${currency} = x ${baseCurrency})`} required value={f.exchangeRate} onChange={(v) => set("exchangeRate", v)} disabled={locked} /> : null}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={f.taxIncluded} disabled={locked} onChange={(e) => set("taxIncluded", e.target.checked)} className="h-4 w-4 accent-brand-700" /> Prices include tax
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Lines" description="Per-line discount and purchase taxes." />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2">Discount</th>
                <th className="px-3 py-2">Taxes</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {f.lines.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="px-3 py-2">
                    <select aria-label={`Line ${i + 1} category`} value={l.expenseCategoryId} disabled={locked} onChange={(e) => setLine(i, { expenseCategoryId: e.target.value })} className={cn(inputClass, "min-w-[9rem] py-1.5")}>
                      <option value="">Category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <Err name={`lines.${i}.expenseCategoryId`} />
                  </td>
                  <td className="px-3 py-2">
                    <input aria-label={`Line ${i + 1} description`} value={l.description} disabled={locked} onChange={(e) => setLine(i, { description: e.target.value })} className={cn(inputClass, "min-w-[12rem] py-1.5")} />
                    <Err name={`lines.${i}.description`} />
                  </td>
                  <td className="px-3 py-2">
                    <input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" value={l.quantity} disabled={locked} onChange={(e) => setLine(i, { quantity: e.target.value })} className={cn(inputClass, "w-20 py-1.5 text-right tabular")} />
                    <Err name={`lines.${i}.quantity`} />
                  </td>
                  <td className="px-3 py-2">
                    <input aria-label={`Line ${i + 1} price`} inputMode="decimal" value={l.price} disabled={locked} onChange={(e) => setLine(i, { price: e.target.value })} className={cn(inputClass, "w-28 py-1.5 text-right tabular")} />
                    <Err name={`lines.${i}.price`} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <input aria-label={`Line ${i + 1} discount`} inputMode="decimal" value={l.discount} disabled={locked} onChange={(e) => setLine(i, { discount: e.target.value })} className={cn(inputClass, "w-16 py-1.5 text-right tabular")} />
                      <select aria-label={`Line ${i + 1} discount type`} value={l.discountType} disabled={locked} onChange={(e) => setLine(i, { discountType: e.target.value as LineState["discountType"] })} className={cn(inputClass, "w-16 py-1.5")}>
                        <option value="PERCENTAGE">%</option>
                        <option value="FIXED">{currency}</option>
                      </select>
                    </div>
                    <Err name={`lines.${i}.discount`} />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Line ${i + 1} taxes`}
                      multiple
                      size={Math.min(3, Math.max(2, taxes.length))}
                      value={l.taxTypeIds.map(String)}
                      disabled={locked || taxes.length === 0}
                      onChange={(e) => setLine(i, { taxTypeIds: [...e.target.selectedOptions].map((o) => Number(o.value)) })}
                      className={cn(inputClass, "min-w-[8rem] py-1 text-xs")}
                    >
                      {taxes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.calculationType === "PERCENTAGE" ? ` ${t.percent}%` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="tabular px-3 py-2 text-right">{money(result.lines[i]?.total ?? 0)}</td>
                  <td className="px-3 py-2">
                    {!locked && f.lines.length > 1 ? (
                      <button type="button" onClick={() => setF((p) => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }))} className="rounded p-1 text-slate-400 hover:text-red-600 focus-ring" aria-label={`Remove line ${i + 1}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="flex flex-wrap items-start justify-between gap-4 border-t border-line">
          <div>
            {!locked ? (
              <Button variant="secondary" size="sm" onClick={() => setF((p) => ({ ...p, lines: [...p.lines, emptyLine(supplier?.expenseCategoryId ? String(supplier.expenseCategoryId) : "")] }))}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add line
              </Button>
            ) : null}
            <FieldError name="lines" />
            {taxes.length === 0 ? <p className="mt-2 text-xs text-muted">Add tax types used for purchases under Settings &gt; Tax types to apply purchase taxes.</p> : null}
          </div>
          <dl className="grid w-64 grid-cols-2 gap-1 text-sm">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular text-right">{money(result.subTotal)}</dd>
            <dt className="text-muted">Tax</dt>
            <dd className="tabular text-right">{money(result.tax)}</dd>
            <dt className="font-semibold">Total</dt>
            <dd className="tabular text-right font-semibold">{money(result.total)}</dd>
            {foreign ? (
              <>
                <dt className="text-muted">In {baseCurrency}</dt>
                <dd className="tabular text-right text-muted">{formatMoney(result.baseTotal, baseCurrency, locale)}</dd>
              </>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <RichTextEditor label="Notes" value={f.notes} onChange={(v) => set("notes", v)} rows={4} />
        </CardBody>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        {!credit && status !== "OPEN" ? (
          <SubmitButton variant="secondary" name="intent" value="draft" pendingLabel="Saving…">
            Save as draft
          </SubmitButton>
        ) : null}
        <SubmitButton name="intent" value="open" pendingLabel="Saving…">
          {credit ? "Save credit" : status === "OPEN" ? "Save bill" : "Save and open"}
        </SubmitButton>
      </div>
    </Form>
  );
}

// ---- allocations -----------------------------------------------------------------------------

type AllocRow = { billId: string; amount: string };

function AllocationEditor({ bills, rows, setRows, available, currency, locale, existing }: { bills: OpenBill[]; rows: AllocRow[]; setRows: (r: AllocRow[]) => void; available: number; currency: string; locale: string; existing: Record<number, number> }) {
  const money = (v: number) => formatMoney(v, currency, locale);
  const allocated = rows.reduce((s, r) => s + toMinor(r.amount || "0"), 0);
  const billDue = (id: number) => (bills.find((b) => b.id === id)?.due ?? 0) + (existing[id] ?? 0);
  const oldestFirst = () => {
    let left = available;
    const next: AllocRow[] = [];
    for (const b of [...bills].sort((a, c) => (a.dueDate ?? a.documentDate).localeCompare(c.dueDate ?? c.documentDate))) {
      if (left <= 0) break;
      const amt = Math.min(left, billDue(b.id));
      if (amt > 0) next.push({ billId: String(b.id), amount: (amt / 100).toFixed(2) });
      left -= amt;
    }
    setRows(next);
  };
  return (
    <div className="space-y-3">
      {bills.length === 0 ? <p className="text-sm text-muted">No open bills for this supplier in {currency}.</p> : null}
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor={`alloc-bill-${i}`}>
              Bill
            </label>
            <select id={`alloc-bill-${i}`} value={r.billId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, billId: e.target.value } : x)))} className={cn(inputClass, "py-1.5")}>
              <option value="">Choose a bill</option>
              {bills.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.number} · due {money(billDue(b.id))}
                </option>
              ))}
            </select>
            <Err name={`allocations.${r.billId}`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor={`alloc-amt-${i}`}>
              Amount
            </label>
            <input id={`alloc-amt-${i}`} inputMode="decimal" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className={cn(inputClass, "w-32 py-1.5 text-right tabular")} />
          </div>
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="mb-1.5 rounded p-1 text-slate-400 hover:text-red-600 focus-ring" aria-label="Remove allocation">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={bills.length === 0} onClick={() => setRows([...rows, { billId: "", amount: "" }])}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add allocation
        </Button>
        <Button size="sm" variant="ghost" disabled={bills.length === 0 || available <= 0} onClick={oldestFirst}>
          Allocate oldest first
        </Button>
      </div>
      <FieldError name="allocations" />
      <dl className="grid max-w-xs grid-cols-2 gap-1 text-sm">
        <dt className="text-muted">Allocated</dt>
        <dd className="tabular text-right">{money(allocated)}</dd>
        <dt className="text-muted">Unallocated</dt>
        <dd className={cn("tabular text-right", allocated > available && "font-semibold text-red-700")}>{money(available - allocated)}</dd>
      </dl>
    </div>
  );
}

export function SupplierPaymentForm({
  action,
  suppliers,
  bills,
  methods,
  baseCurrency,
  locale,
  rates,
  initial,
  existing,
  refunded = 0,
  cancelHref,
}: {
  action: FormAction;
  suppliers: SupplierOpt[];
  bills: OpenBill[];
  methods: { id: number; name: string }[];
  baseCurrency: string;
  locale: string;
  rates: Record<string, number>;
  initial: { supplierId: string; number: string; reference: string; paymentDate: string; amount: string; exchangeRate: string; paymentMethodId: string; notes: string; allocations: AllocRow[] };
  existing: Record<number, number>;
  refunded?: number;
  cancelHref: string;
}) {
  const [f, setF] = useState(initial);
  const set = <K extends keyof typeof initial>(k: K, v: (typeof initial)[K]) => setF((p) => ({ ...p, [k]: v }));
  const supplier = suppliers.find((s) => String(s.id) === f.supplierId);
  const currency = supplier?.currency ?? baseCurrency;
  const foreign = currency !== baseCurrency;
  const supplierBills = bills.filter((b) => String(b.supplierId) === f.supplierId && b.currency === currency);
  const payload = JSON.stringify({ ...f, exchangeRate: foreign ? f.exchangeRate : 1, allocations: f.allocations.filter((a) => a.billId && a.amount).map((a) => ({ billId: Number(a.billId), amount: a.amount })) });
  return (
    <Form action={action} className="space-y-6" showErrorSummary>
      <input type="hidden" name="payload" value={payload} />
      <Card>
        <CardHeader title="Payment" />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="sp-supplier" required>
              Supplier
            </Label>
            <select
              id="sp-supplier"
              value={f.supplierId}
              onChange={(e) => {
                const s = suppliers.find((x) => String(x.id) === e.target.value);
                setF((p) => ({ ...p, supplierId: e.target.value, allocations: [], exchangeRate: s && s.currency !== baseCurrency ? String(rates[s.currency] ?? "") : "1" }));
              }}
              className={inputClass}
            >
              <option value="">Choose a supplier</option>
              {suppliers.filter((s) => s.enabled || String(s.id) === initial.supplierId).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.currency})
                </option>
              ))}
            </select>
            <Err name="supplierId" />
          </div>
          <TextInput id="sp-date" name="paymentDate" label="Payment date" type="date" required value={f.paymentDate} onChange={(v) => set("paymentDate", v)} />
          <TextInput id="sp-number" name="number" label="Payment number" value={f.number} onChange={(v) => set("number", v)} hint="Leave blank to use the next number." />
          <TextInput id="sp-amount" name="amount" label={`Amount (${currency})`} required value={f.amount} onChange={(v) => set("amount", v)} hint={refunded ? `Refunded so far: ${formatMoney(refunded, currency, locale)}` : undefined} />
          {foreign ? <TextInput id="sp-rate" name="exchangeRate" label={`Exchange rate (1 ${currency} = x ${baseCurrency})`} required value={f.exchangeRate} onChange={(v) => set("exchangeRate", v)} /> : null}
          <div>
            <Label htmlFor="sp-method">Payment mode</Label>
            <select id="sp-method" value={f.paymentMethodId} onChange={(e) => set("paymentMethodId", e.target.value)} className={inputClass}>
              <option value="">None</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <TextInput id="sp-ref" name="reference" label="Reference" value={f.reference} onChange={(v) => set("reference", v)} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Allocations" description="Apply the payment to open bills of this supplier." />
        <CardBody>
          {supplier ? (
            <AllocationEditor bills={supplierBills} rows={f.allocations} setRows={(r) => set("allocations", r)} available={toMinor(f.amount || "0") - refunded} currency={currency} locale={locale} existing={existing} />
          ) : (
            <p className="text-sm text-muted">Select a supplier to allocate.</p>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <RichTextEditor label="Notes" value={f.notes} onChange={(v) => set("notes", v)} rows={3} />
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingLabel="Saving…">Save payment</SubmitButton>
      </div>
    </Form>
  );
}

export function CreditAllocationForm({ action, bills, available, currency, locale, initial }: { action: FormAction; bills: OpenBill[]; available: number; currency: string; locale: string; initial: AllocRow[] }) {
  const [rows, setRows] = useState<AllocRow[]>(initial);
  const existing = Object.fromEntries(initial.map((r) => [Number(r.billId), toMinor(r.amount)]));
  return (
    <Form action={action} className="space-y-4">
      <input type="hidden" name="payload" value={JSON.stringify({ allocations: rows.filter((r) => r.billId && r.amount) })} />
      <AllocationEditor bills={bills} rows={rows} setRows={setRows} available={available} currency={currency} locale={locale} existing={existing} />
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save allocations
        </SubmitButton>
      </div>
    </Form>
  );
}
