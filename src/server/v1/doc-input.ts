import { ApiError } from "@/server/api";
import { documentSchema, type DocumentInput } from "@/server/documents";

/** Maps API document bodies (minor units, snake_case) to the shared document input (spec §9.2 invoices). */

export function parseDoc(input: DocumentInput): DocumentInput {
  const r = documentSchema.safeParse(input);
  if (!r.success) throw new ApiError(422, "The given data was invalid.", Object.fromEntries(r.error.issues.map((i) => [i.path.join(".") || "items", [i.message]])));
  return r.data;
}

export function docInput(b: Record<string, unknown>, dateKey: string, closingKey: string, numberKey: string): DocumentInput {
  const items = (b.items as Record<string, unknown>[] | undefined) ?? [];
  const taxIds = (arr: unknown) => ((arr as { tax_type_id: number }[] | undefined) ?? []).map((t) => Number(t.tax_type_id));
  return {
    customerId: Number(b.customer_id),
    date: String(b[dateKey] ?? ""),
    closingDate: (b[closingKey] as string) ?? null,
    number: String(b[numberKey] ?? ""),
    referenceNumber: (b.reference_number as string) ?? null,
    exchangeRate: (b.exchange_rate as number) ?? 1,
    discountType: String(b.discount_type ?? "fixed").toUpperCase() === "PERCENTAGE" ? "PERCENTAGE" : "FIXED",
    discount: Number(b.discount ?? 0),
    taxIncluded: !!b.tax_included,
    notes: (b.notes as string) ?? null,
    templateName: (b.template_name as string) ?? undefined,
    taxes: taxIds(b.taxes),
    minor: true,
    lines: items.map((l) => ({
      itemId: l.item_id ? Number(l.item_id) : null,
      name: String(l.name ?? ""),
      description: (l.description as string) ?? null,
      unitName: (l.unit_name as string) ?? null,
      quantity: Number(l.quantity),
      price: Number(l.price),
      discountType: String(l.discount_type ?? "fixed").toUpperCase() === "PERCENTAGE" ? "PERCENTAGE" : "FIXED",
      discount: Number(l.discount ?? 0),
      taxes: taxIds(l.taxes),
    })),
  };
}

