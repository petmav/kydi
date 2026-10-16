"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure, guard, success, type ActionState } from "@/lib/action";
import { requireAbility } from "@/lib/auth/context";
import { setFlash } from "@/lib/flash";
import { documentSchema } from "@/server/documents";
import { cloneEstimate, convertEstimateToInvoice, deleteEstimates, saveEstimate, setEstimateStatus } from "@/server/estimates";
import { saveDefaultTemplate } from "@/server/user-settings";

export async function saveEstimateAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(id ? "edit-estimate" : "create-estimate");
    let raw: unknown = {};
    try {
      raw = JSON.parse(String(formData.get("payload") ?? "{}"));
    } catch {
      /* handled by schema */
    }
    const parsed = documentSchema.safeParse(raw);
    if (!parsed.success) {
      const fe: Record<string, string[]> = {};
      for (const i of parsed.error.issues) fe[i.path.join(".") || "lines"] = [i.message];
      return failure("Please correct the highlighted fields.", fe);
    }
    const send = formData.get("intent") === "send";
    const res = await saveEstimate(ctx, id, parsed.data, formData, send && !id);
    if (!res.ok) return failure(res.error, res.fieldErrors);
    if (formData.get("makeDefaultTemplate") === "on" && parsed.data.templateName) await saveDefaultTemplate(ctx.user.id, "estimate", parsed.data.templateName);
    revalidatePath("/estimates");
    await setFlash(id ? "Estimate updated successfully." : "Estimate created successfully.");
    redirect(`/estimates/${res.id}${send ? "?send=1" : ""}`);
  });
}

export async function deleteEstimatesAction(ids: number[]): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-estimate");
    const n = await deleteEstimates(ctx, ids);
    revalidatePath("/estimates");
    return n ? success(n === 1 ? "Estimate deleted." : `${n} estimates deleted.`) : failure("Nothing was deleted.");
  });
}

export async function deleteEstimateAction(id: number): Promise<ActionState> {
  const r = await deleteEstimatesAction([id]);
  if (r?.ok) {
    await setFlash("Estimate deleted.");
    redirect("/estimates");
  }
  return r;
}

export async function setEstimateStatusAction(id: number, status: "SENT" | "ACCEPTED" | "REJECTED"): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(status === "SENT" ? "send-estimate" : "edit-estimate");
    const r = await setEstimateStatus(ctx, id, status);
    revalidatePath(`/estimates/${id}`);
    return r.ok ? success(status === "SENT" ? "Estimate marked as sent." : status === "ACCEPTED" ? "Estimate marked as accepted." : "Estimate marked as rejected.") : failure(r.error);
  });
}

export async function cloneEstimateAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("create-estimate");
    const r = await cloneEstimate(ctx, id);
    if (!r.ok) return failure(r.error);
    await setFlash("Estimate cloned. Review and save the copy.");
    redirect(`/estimates/${r.id}/edit`);
  });
}

export async function convertEstimateAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("create-invoice");
    const r = await convertEstimateToInvoice(ctx, id);
    if (!r.ok) return failure(r.error);
    revalidatePath("/estimates");
    await setFlash("Invoice created from estimate.");
    redirect(`/invoices/${r.id}`);
  });
}
