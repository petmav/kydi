import { R, roundTo, toBase } from "@/lib/money";

/** Document arithmetic, spec §4.1–4.3. All money in integer minor units. */

export type DiscountKind = "FIXED" | "PERCENTAGE";

export type TaxSpec = {
  taxTypeId: number | null;
  name: string;
  calculationType: "PERCENTAGE" | "FIXED";
  percent: number | null;
  fixedAmount: number | null; // minor units
  compound: boolean;
};

export type TaxRow = TaxSpec & { amount: number; baseAmount: number };

export type LineInput = {
  price: number; // minor units
  quantity: number;
  discountType: DiscountKind;
  discount: number; // percent, or fixed minor units
  taxes: TaxSpec[];
};

export type DocumentInput = {
  lines: LineInput[];
  discountPerItem: boolean;
  taxPerItem: boolean;
  taxIncluded: boolean;
  discountType: DiscountKind;
  discount: number; // percent, or fixed minor units
  taxes: TaxSpec[];
  exchangeRate: number;
};

export type LineResult = {
  subtotal: number;
  discountVal: number;
  total: number;
  tax: number;
  taxes: TaxRow[];
  basePrice: number;
  baseDiscountVal: number;
  baseTax: number;
  baseTotal: number;
};

export type DocumentResult = {
  lines: LineResult[];
  subTotal: number;
  discountVal: number;
  taxes: TaxRow[]; // document-level rows (empty when tax per item)
  simpleTax: number;
  compoundTax: number;
  tax: number;
  total: number;
  baseSubTotal: number;
  baseDiscountVal: number;
  baseTax: number;
  baseTotal: number;
};

/** Spec §4.2: simple rows first, then compound rows; original order kept for display. */
export function calculateTaxes(base: number, specs: TaxSpec[], taxIncluded: boolean, rate = 1): TaxRow[] {
  const amounts = new Array<number>(specs.length).fill(0);
  let simpleSum = 0;
  specs.forEach((t, i) => {
    if (t.compound) return;
    let amount = 0;
    if (t.calculationType === "FIXED") amount = t.fixedAmount ?? 0;
    else if (t.percent && base !== 0) {
      amount = taxIncluded ? R(base - base / (1 + t.percent / 100)) : R((base * t.percent) / 100);
    }
    amounts[i] = amount;
    simpleSum += amount;
  });
  specs.forEach((t, i) => {
    if (!t.compound) return;
    let amount = 0;
    if (t.calculationType === "FIXED") amount = t.fixedAmount ?? 0;
    else if (t.percent) {
      amount = taxIncluded ? R((base * t.percent) / 100) : R(((base + simpleSum) * t.percent) / 100);
    }
    amounts[i] = amount;
  });
  return specs.map((t, i) => ({ ...t, amount: amounts[i], baseAmount: toBase(amounts[i], rate) }));
}

function lineDiscount(subtotal: number, type: DiscountKind, discount: number): number {
  if (!discount) return 0;
  if (type === "PERCENTAGE") return R((Math.abs(subtotal) * discount) / 100);
  return Math.min(R(discount), Math.abs(subtotal));
}

const sumBy = (rows: TaxRow[], compound: boolean) => rows.filter((r) => r.compound === compound).reduce((s, r) => s + r.amount, 0);

export function computeDocument(input: DocumentInput): DocumentResult {
  const rate = input.exchangeRate || 1;

  const lines = input.lines.map((l) => {
    const subtotal = R(l.price * l.quantity);
    const discountVal = input.discountPerItem ? lineDiscount(subtotal, l.discountType, l.discount) : 0;
    return { subtotal, discountVal, total: subtotal - discountVal, l };
  });

  const subTotal = lines.reduce((s, l) => s + l.total, 0);

  let discountVal = 0;
  let D = 0;
  if (!input.discountPerItem && input.discount) {
    if (input.discountType === "PERCENTAGE") {
      D = (subTotal * input.discount) / 100;
      discountVal = R(D);
    } else {
      D = R(input.discount);
      discountVal = D;
    }
  }

  let docTaxes: TaxRow[] = [];
  const lineResults: LineResult[] = lines.map((x) => ({
    subtotal: x.subtotal,
    discountVal: x.discountVal,
    total: x.total,
    tax: 0,
    taxes: [],
    basePrice: toBase(x.l.price, rate),
    baseDiscountVal: toBase(x.discountVal, rate),
    baseTax: 0,
    baseTotal: toBase(x.total, rate),
  }));

  if (input.taxPerItem) {
    lines.forEach((x, i) => {
      let base = x.total;
      if (!input.discountPerItem && input.discount > 0 && subTotal !== 0) {
        const p = roundTo(x.total / subTotal, 2);
        base = x.total - R(D * p);
      }
      const rows = calculateTaxes(base, x.l.taxes, input.taxIncluded, rate);
      const tax = rows.reduce((s, r) => s + r.amount, 0);
      lineResults[i].taxes = rows;
      lineResults[i].tax = tax;
      lineResults[i].baseTax = toBase(tax, rate);
    });
  } else {
    docTaxes = calculateTaxes(subTotal - discountVal, input.taxes, input.taxIncluded, rate);
  }

  const allRows = input.taxPerItem ? lineResults.flatMap((l) => l.taxes) : docTaxes;
  const simpleTax = sumBy(allRows, false);
  const compoundTax = sumBy(allRows, true);
  const tax = simpleTax + compoundTax;
  const total = input.taxIncluded ? subTotal - discountVal + compoundTax : subTotal - discountVal + simpleTax + compoundTax;

  return {
    lines: lineResults,
    subTotal,
    discountVal,
    taxes: docTaxes,
    simpleTax,
    compoundTax,
    tax,
    total,
    baseSubTotal: toBase(subTotal, rate),
    baseDiscountVal: toBase(discountVal, rate),
    baseTax: toBase(tax, rate),
    baseTotal: toBase(total, rate),
  };
}

/** Summary rows for display: per-line taxes grouped per tax type/name (spec §4.2). */
export function taxSummary(result: { lines: { taxes: TaxRow[] }[]; taxes: TaxRow[] }, taxPerItem: boolean) {
  const rows = taxPerItem ? result.lines.flatMap((l) => l.taxes) : result.taxes;
  const map = new Map<string, { name: string; percent: number | null; calculationType: string; amount: number }>();
  for (const r of rows) {
    const key = `${r.taxTypeId ?? r.name}|${r.percent ?? ""}|${r.calculationType}`;
    const cur = map.get(key);
    if (cur) cur.amount += r.amount;
    else map.set(key, { name: r.name, percent: r.percent, calculationType: r.calculationType, amount: r.amount });
  }
  return [...map.values()];
}
