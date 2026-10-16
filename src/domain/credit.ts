import { Rh } from "@/lib/money";

/** Credit-note math, spec §4.8: cumulative-difference model so partial credits telescope exactly. */

export type CreditTaxRow = { key: string; name: string; amount: number };
export type CreditLine = {
  id: number;
  quantity: number;
  price: number;
  discountVal: number;
  taxes: CreditTaxRow[];
};
export type CreditSource = {
  subTotal: number;
  discountVal: number;
  total: number;
  taxPerItem: boolean;
  discountPerItem: boolean;
  taxIncluded: boolean;
  taxes: CreditTaxRow[]; // document-level rows
  lines: CreditLine[];
  paid: number;
  credited: number; // |sum of existing credit note totals|
};

type Cumulative = {
  lines: Map<number, { amount: number; discount: number; total: number; taxes: Map<string, number> }>;
  subTotal: number;
  discount: number;
  docTaxes: Map<string, number>;
  tax: number;
  total: number;
};

const h = (q: number) => Math.round(q * 100); // hundredths of quantity

function cumulative(src: CreditSource, qty: Map<number, number>): Cumulative {
  const lines = new Map<number, { amount: number; discount: number; total: number; taxes: Map<string, number> }>();
  let subTotal = 0;
  let lineTax = 0;
  for (const l of src.lines) {
    const Q = h(l.quantity);
    const q = Math.min(h(qty.get(l.id) ?? 0), Q);
    const ratio = Q === 0 ? 0 : q / Q;
    const amount = Rh((l.price * q) / 100);
    const discount = src.discountPerItem ? Rh(l.discountVal * ratio) : 0;
    const taxes = new Map(l.taxes.map((t) => [t.key, Rh(t.amount * ratio)]));
    const total = amount - discount;
    subTotal += total;
    lineTax += [...taxes.values()].reduce((s, x) => s + x, 0);
    lines.set(l.id, { amount, discount, total, taxes });
  }
  const docRatio = src.subTotal === 0 ? 0 : subTotal / src.subTotal;
  const discount = Rh(src.discountVal * docRatio);
  const docTaxes = new Map(src.taxes.map((t) => [t.key, Rh(t.amount * docRatio)]));
  const docTax = [...docTaxes.values()].reduce((s, x) => s + x, 0);
  const tax = src.taxPerItem ? lineTax : docTax;
  const total = subTotal - discount + (src.taxIncluded ? 0 : tax);
  return { lines, subTotal, discount, docTaxes, tax, total };
}

export type CreditResult =
  | { ok: false; error: string }
  | {
      ok: true;
      lines: { id: number; quantity: number; amount: number; discountVal: number; total: number; taxes: CreditTaxRow[] }[];
      subTotal: number;
      discountVal: number;
      taxes: CreditTaxRow[];
      tax: number;
      total: number;
    };

/**
 * @param creditedQty quantities already credited per line id
 * @param request quantities to credit now per line id; empty = everything remaining
 */
export function computeCreditNote(src: CreditSource, creditedQty: Map<number, number>, request: Map<number, number>): CreditResult {
  const remainingQty = src.lines.reduce((s, l) => s + Math.max(0, h(l.quantity) - h(creditedQty.get(l.id) ?? 0)), 0);
  if (remainingQty === 0 || src.total - src.paid - src.credited <= 0) return { ok: false, error: "invoice_already_fully_credited" };

  const after = new Map<number, number>();
  for (const l of src.lines) {
    const before = creditedQty.get(l.id) ?? 0;
    const add = request.size === 0 ? Math.max(0, l.quantity - before) : request.get(l.id) ?? 0;
    if (add < 0) return { ok: false, error: "credit_quantity_exceeds_remaining" };
    if (h(before + add) > h(l.quantity)) return { ok: false, error: "credit_quantity_exceeds_remaining" };
    after.set(l.id, before + add);
  }
  const b = cumulative(src, creditedQty);
  const a = cumulative(src, after);
  const lines = src.lines
    .map((l) => {
      const la = a.lines.get(l.id)!;
      const lb = b.lines.get(l.id)!;
      return {
        id: l.id,
        quantity: (h(after.get(l.id) ?? 0) - h(creditedQty.get(l.id) ?? 0)) / 100,
        amount: la.amount - lb.amount,
        discountVal: la.discount - lb.discount,
        total: la.total - lb.total,
        taxes: l.taxes.map((t) => ({ ...t, amount: (la.taxes.get(t.key) ?? 0) - (lb.taxes.get(t.key) ?? 0) })),
      };
    })
    .filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "credit_note_must_credit_something" };
  const total = a.total - b.total;
  if (src.credited + total > src.total - src.paid) return { ok: false, error: "credit_amount_exceeds_invoice_balance" };
  return {
    ok: true,
    lines,
    subTotal: a.subTotal - b.subTotal,
    discountVal: a.discount - b.discount,
    taxes: src.taxes.map((t) => ({ ...t, amount: (a.docTaxes.get(t.key) ?? 0) - (b.docTaxes.get(t.key) ?? 0) })),
    tax: a.tax - b.tax,
    total,
  };
}
