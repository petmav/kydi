"use server";

import { revalidatePath } from "next/cache";
import { failure, formToObject, guard, success, type ActionState } from "@/lib/action";
import { requireOwner } from "@/lib/auth/context";
import { disconnectGateway, saveGateway, testGateway } from "@/server/online-payments";

export async function saveGatewayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const r = await saveGateway(ctx.companyId, formToObject(formData));
    if (!r.ok) return failure(r.error, r.fieldErrors);
    revalidatePath("/settings/online-payments");
    return success(r.message ?? "Online payment settings saved.");
  });
}

export async function testGatewayAction(): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const r = await testGateway(ctx.companyId);
    return r.ok ? success(r.message) : failure(r.error);
  });
}

export async function disconnectGatewayAction(): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    await disconnectGateway(ctx.companyId);
    revalidatePath("/settings/online-payments");
    return success("Stripe disconnected. Online payments are off.");
  });
}
