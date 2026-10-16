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
    // Invoice dates may arrive as "YYYY-MM-DD HH:MM" when invoice_use_time is on (spec §9.1).
    date: String(b[dateKey] ?? "").slice(0, 10),
    time: typeof b[dateKey] === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(b[dateKey] as string) ? (b[dateKey] as string).slice(11, 16) : null,
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
      customFields: Array.isArray(l.custom_fields) ? Object.fromEntries((l.custom_fields as { id: number; value: string | number | boolean | null }[]).map((f) => [String(f.id), f.value])) : null,
    })),
  };
}

