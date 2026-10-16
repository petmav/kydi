"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Form, SubmitButton, type FormAction } from "@/components/form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, inputClass } from "@/components/ui/primitives";
import { formatMoney, minorToInput, toMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

type Pay = { id: number; number: string; date: string; available: number };
type Inv = { id: number; number: string; available: number; dueDate: string | null };
type Row = { key: number; paymentId: string; invoiceId: string; amount: string };

export function ApplyCreditForm({ action, payments, invoices, currency, locale, cancelHref }: { action: FormAction; payments: Pay[]; invoices: Inv[]; currency: string; locale: string; cancelHref: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const money = (v: number) => formatMoney(v, currency, locale);
  const used = (field: "paymentId" | "invoiceId", id: number) => rows.filter((r) => Number(r[field]) === id).reduce((s, r) => s + (toMinor(r.amount) || 0), 0);
  const oldest = () => {
    const next: Row[] = [];
    const pay = payments.map((p) => ({ ...p, left: p.available }));
    let k = 0;
    for (const inv of invoices) {
      let need = inv.available;
      for (const p of pay) {
        if (need <= 0) break;
        const take = Math.min(need, p.left);
        if (take > 0) {
          next.push({ key: k++, paymentId: String(p.id), invoiceId: String(inv.id), amount: minorToInput(take) });
          p.left -= take;
          need -= take;
        }
      }
    }
    setRows(next);
  };
  if (!payments.length || !invoices.length) {
    return (
      <Card>
        <EmptyState title="Nothing to apply" description={!payments.length ? "This customer has no unapplied payments." : "This customer has no open invoices."} action={<ButtonLink href={cancelHref} variant="secondary">Back</ButtonLink>} />
      </Card>
    );
  }
  const over = payments.some((p) => used("paymentId", p.id) > p.available) || invoices.some((i) => used("invoiceId", i.id) > i.available);
  return (
    <Form action={action} className="space-y-6">
      <input type="hidden" name="payload" value={JSON.stringify(rows.filter((r) => r.paymentId && r.invoiceId).map(({ paymentId, invoiceId, amount }) => ({ paymentId, invoiceId, amount })))} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Available credit" />
          <ul className="divide-y divide-line text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between px-5 py-2"><span>{p.number} · {p.date}</span><span className="tabular">{money(p.available - used("paymentId", p.id))} of {money(p.available)}</span></li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Open invoices" />
          <ul className="divide-y divide-line text-sm">
            {invoices.map((i) => (
              <li key={i.id} className="flex justify-between px-5 py-2"><span>{i.number}{i.dueDate ? ` · due ${i.dueDate}` : ""}</span><span className="tabular">{money(i.available - used("invoiceId", i.id))} of {money(i.available)}</span></li>
            ))}
          </ul>
        </Card>
      </div>
      <Card>
        <CardHeader title="Allocations" actions={<Button size="sm" variant="secondary" onClick={oldest}>Allocate oldest first</Button>} />
        <CardBody className="space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap gap-2">
              <select aria-label="Payment" className={cn(inputClass, "max-w-[14rem]")} value={r.paymentId} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, paymentId: e.target.value } : x)))}>
                <option value="">Payment…</option>
                {payments.map((p) => <option key={p.id} value={p.id}>{p.number}</option>)}
              </select>
              <select aria-label="Invoice" className={cn(inputClass, "max-w-[14rem]")} value={r.invoiceId} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, invoiceId: e.target.value } : x)))}>
                <option value="">Invoice…</option>
                {invoices.map((i) => <option key={i.id} value={i.id}>{i.number}</option>)}
              </select>
              <input aria-label="Amount" inputMode="decimal" className={cn(inputClass, "w-32 tabular text-right")} value={r.amount} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))} />
              <button type="button" aria-label="Remove row" className="rounded p-2 text-red-600 hover:bg-red-50 focus-ring" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={() => setRows((rs) => [...rs, { key: Date.now(), paymentId: "", invoiceId: "", amount: "" }])}><Plus className="h-4 w-4" aria-hidden="true" /> Add row</Button>
          {over ? <p className="text-sm font-medium text-red-700">An amount exceeds the available credit or the invoice balance.</p> : null}
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">Cancel</ButtonLink>
        <SubmitButton disabled={over || rows.length === 0} pendingLabel="Applying…">Apply credit</SubmitButton>
      </div>
    </Form>
  );
}
