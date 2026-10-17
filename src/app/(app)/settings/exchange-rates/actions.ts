"use server";

import { revalidatePath } from "next/cache";
import { failure, guard, parseForm, success, type ActionState } from "@/lib/action";
import { requireAbility } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { deleteProvider, fetchProviderRate, providerSchema, saveProvider, setProviderActive } from "@/server/exchange-rates";

export async function saveProviderAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(id ? "edit-exchange-rate-provider" : "create-exchange-rate-provider");
    const parsed = parseForm(providerSchema, formData);
    if (!parsed.success) return parsed.state;
    const r = await saveProvider(ctx.companyId, id, parsed.data);
    if (!r.ok) return failure(r.error, r.fieldErrors);
    revalidatePath("/settings/exchange-rates");
    return success(id ? "Provider updated." : "Provider added.");
  });
}

export async function toggleProviderAction(id: number, active: boolean): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("edit-exchange-rate-provider");
    const r = await setProviderActive(ctx.companyId, id, active);
    if (!r.ok) return failure(r.error);
    revalidatePath("/settings/exchange-rates");
    return success(active ? "Provider activated." : "Provider deactivated.");
  });
}

export async function deleteProviderAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-exchange-rate-provider");
    const r = await deleteProvider(ctx.companyId, id);
    if (!r.ok) return failure(r.error);
    revalidatePath("/settings/exchange-rates");
    return success("Provider deleted.");
  });
}

/** Fetches a live quote for the provider's first currency so the owner can check the key. */
export async function testProviderAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("view-exchange-rate-provider");
    const p = await db.exchangeRateProvider.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!p) return failure("Provider not found.");
    const foreign = p.currencies.find((c) => c !== ctx.settings.currency);
    if (!foreign) return failure("Add a currency other than the company currency first.");
    try {
      const rate = await fetchProviderRate(p, foreign, ctx.settings.currency);
      return success(`Live rate: 1 ${foreign} = ${rate} ${ctx.settings.currency}.`);
    } catch (e) {
      return failure(`Rate check failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  });
}
