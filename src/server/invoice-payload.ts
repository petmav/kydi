import { documentSchema, type DocumentInput } from "./documents";
import { recurringFieldsSchema, type RecurringFields } from "./recurring";

/**
 * Invoice form payload routing (spec §5.4): a new invoice saved with "Make recurring" switched on becomes a
 * recurring invoice. Shared by the server action and the end-to-end tests.
 */

export function isMakeRecurring(raw: unknown, id: number | null): boolean {
  return !id && !!raw && typeof raw === "object" && (raw as { makeRecurring?: unknown }).makeRecurring === true;
}

export function parseRecurringPayload(raw: unknown): { ok: true; doc: DocumentInput; rec: RecurringFields } | { ok: false; fieldErrors: Record<string, string[]> } {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const doc = documentSchema.safeParse(obj);
  const rec = recurringFieldsSchema.safeParse(obj.recurring);
  if (doc.success && rec.success) return { ok: true, doc: doc.data, rec: rec.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const i of [...(doc.success ? [] : doc.error.issues), ...(rec.success ? [] : rec.error.issues)]) fieldErrors[i.path.join(".") || "lines"] = [i.message];
  return { ok: false, fieldErrors };
}
