"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure, guard, success, type ActionState } from "@/lib/action";
import { requireAbility } from "@/lib/auth/context";
import { setFlash } from "@/lib/flash";
import { documentSchema } from "@/server/documents";
import { deleteRecurring, pauseResume, recurringFieldsSchema, saveRecurring } from "@/server/recurring";

export async function saveRecurringAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(id ? "edit-recurring-invoice" : "create-recurring-invoice");
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(String(formData.get("payload") ?? "{}"));
    } catch {
      /* schema reports */
    }
    const doc = documentSchema.safeParse(raw);
    const rec = recurringFieldsSchema.safeParse(raw.recurring);
    if (!doc.success || !rec.success) {
      const fe: Record<string, string[]> = {};
      for (const i of [...(doc.success ? [] : doc.error.issues), ...(rec.success ? [] : rec.error.issues)]) fe[i.path.join(".") || "lines"] = [i.message];
      return failure("Please correct the highlighted fields.", fe);
    }
    const res = await saveRecurring(ctx, id, doc.data, rec.data, formData);
    if (!res.ok) return failure(res.error, res.fieldErrors);
    revalidatePath("/recurring-invoices");
    await setFlash(id ? "Recurring invoice updated." : "Recurring invoice created.");
    redirect(`/recurring-invoices/${res.id}`);
  });
}

export async function pauseResumeAction(id: number, action: "pause" | "resume"): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("edit-recurring-invoice");
    const r = await pauseResume(ctx, id, action);
    revalidatePath(`/recurring-invoices/${id}`);
    revalidatePath("/recurring-invoices");
    return r.ok ? success(action === "pause" ? "Schedule paused." : "Schedule resumed.") : failure(r.error);
  });
}

export async function deleteRecurringAction(ids: number[]): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-recurring-invoice");
    const n = await deleteRecurring(ctx, ids);
    revalidatePath("/recurring-invoices");
    return n ? success(n === 1 ? "Recurring invoice deleted. Generated invoices were kept." : `${n} recurring invoices deleted.`) : failure("Nothing was deleted.");
  });
}

export async function deleteOneRecurringAction(id: number): Promise<ActionState> {
  const r = await deleteRecurringAction([id]);
  if (r?.ok) {
    await setFlash("Recurring invoice deleted. Generated invoices were kept.");
    redirect("/recurring-invoices");
  }
  return r;
}
