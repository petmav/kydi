"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { failure, guard, success, type ActionState } from "@/lib/action";
import { requireAbility } from "@/lib/auth/context";
import { setFlash } from "@/lib/flash";
import { documentSchema } from "@/server/documents";
import { recurringFieldsSchema, saveRecurring } from "@/server/recurring";
import { cloneInvoice, convertInvoiceToEstimate, createCreditNote, deleteInvoices, markInvoiceCompleted, markInvoiceSent, saveInvoice } from "@/server/invoices";
import { saveDefaultTemplate } from "@/server/user-settings";

function parsePayload(formData: FormData) {
  try {
    return documentSchema.safeParse(JSON.parse(String(formData.get("payload") ?? "{}")));
  } catch {
    return documentSchema.safeParse({});
  }
}

export async function saveInvoiceAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(String(formData.get("payload") ?? "{}"));
    } catch {
      /* schema reports */
    }
    // "Make recurring" on a new invoice turns the form into a recurring invoice (spec §5.4).
    if (!id && raw.makeRecurring === true) return saveAsRecurring(raw, formData);
    const ctx = await requireAbility(id ? "edit-invoice" : "create-invoice");
    const parsed = parsePayload(formData);
    if (!parsed.success) {
      const fe: Record<string, string[]> = {};
      for (const i of parsed.error.issues) fe[i.path.join(".") || "lines"] = [i.message];
      return failure("Please correct the highlighted fields.", fe);
    }
    const send = formData.get("intent") === "send";
    const res = await saveInvoice(ctx, id, parsed.data, formData, send && !id);
    if (!res.ok) return failure(res.error, res.fieldErrors);
    if (formData.get("makeDefaultTemplate") === "on" && parsed.data.templateName) await saveDefaultTemplate(ctx.user.id, "invoice", parsed.data.templateName);
    revalidatePath("/invoices");
    await setFlash(id ? "Invoice updated successfully." : "Invoice created successfully.");
    redirect(`/invoices/${res.id}${send ? "?send=1" : ""}`);
  });
}

export async function deleteInvoicesAction(ids: number[]): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-invoice");
    const { deleted, blocked } = await deleteInvoices(ctx, ids);
    revalidatePath("/invoices");
    if (blocked.length) return failure(`${blocked.join(", ")} cannot be deleted because payments are allocated to ${blocked.length === 1 ? "it" : "them"}.${deleted ? ` ${deleted} deleted.` : ""}`);
    return success(deleted === 1 ? "Invoice deleted." : `${deleted} invoices deleted.`);
  });
}

export async function deleteInvoiceAction(id: number): Promise<ActionState> {
  const r = await deleteInvoicesAction([id]);
  if (r?.ok) {
    await setFlash("Invoice deleted.");
    redirect("/invoices");
  }
  return r;
}

export async function markInvoiceSentAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("send-invoice");
    const r = await markInvoiceSent(ctx, id);
    revalidatePath(`/invoices/${id}`);
    return r.ok ? success("Invoice marked as sent.") : failure(r.error);
  });
}

export async function markInvoiceCompletedAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("edit-invoice");
    const r = await markInvoiceCompleted(ctx, id);
    revalidatePath(`/invoices/${id}`);
    return r.ok ? success("Invoice marked as completed.") : failure(r.error);
  });
}

export async function cloneInvoiceAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("create-invoice");
    const r = await cloneInvoice(ctx, id);
    if (!r.ok) return failure(r.error);
    await setFlash("Invoice cloned. Review and save the copy.");
    redirect(`/invoices/${r.id}/edit`);
  });
}

export async function convertInvoiceToEstimateAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("create-estimate");
    const r = await convertInvoiceToEstimate(ctx, id);
    if (!r.ok) return failure(r.error);
    await setFlash("Estimate created from invoice.");
    redirect(`/estimates/${r.id}`);
  });
}

const creditSchema = z.object({ reason: z.string().trim().max(1000).optional() });

export async function createCreditNoteAction(id: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("create-invoice");
    const { reason } = creditSchema.parse({ reason: formData.get("reason") ?? undefined });
    const request = new Map<number, number>();
    for (const [k, v] of formData.entries()) {
      const m = k.match(/^qty_(\d+)$/);
      if (m) {
        const q = Number(v);
        if (!Number.isFinite(q) || q < 0) return failure("Quantities must be 0 or more.", { [k]: ["Enter 0 or more."] });
        request.set(Number(m[1]), q);
      }
    }
    if (request.size && [...request.values()].every((q) => q === 0)) return failure("Enter a quantity to credit on at least one line.");
    const r = await createCreditNote(ctx, id, reason || null, request);
    if (!r.ok) return failure(r.error);
    revalidatePath("/invoices");
    await setFlash("Credit note created.");
    redirect(`/invoices/${r.id}`);
  });
}

async function saveAsRecurring(raw: Record<string, unknown>, formData: FormData): Promise<ActionState> {
  const ctx = await requireAbility("create-recurring-invoice");
  const doc = documentSchema.safeParse(raw);
  const rec = recurringFieldsSchema.safeParse(raw.recurring);
  if (!doc.success || !rec.success) {
    const fe: Record<string, string[]> = {};
    for (const i of [...(doc.success ? [] : doc.error.issues), ...(rec.success ? [] : rec.error.issues)]) fe[i.path.join(".") || "lines"] = [i.message];
    return failure("Please correct the highlighted fields.", fe);
  }
  const res = await saveRecurring(ctx, null, doc.data, rec.data, formData);
  if (!res.ok) return failure(res.error, res.fieldErrors);
  revalidatePath("/recurring-invoices");
  await setFlash("Recurring invoice created.");
  redirect(`/recurring-invoices/${res.id}`);
}
