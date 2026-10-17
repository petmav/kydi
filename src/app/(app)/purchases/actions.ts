"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { failure, formToObject, guard, parseForm, success, type ActionState } from "@/lib/action";
import { requireAbility } from "@/lib/auth/context";
import { setFlash } from "@/lib/flash";
import { toMinor } from "@/lib/money";
import {
  allocateCredit,
  billSchema,
  deleteBill,
  deleteRecurringCost,
  deleteSupplier,
  deleteSupplierPayment,
  openBill,
  recurringCostSchema,
  refundSchema,
  saveBill,
  saveRecurringCost,
  saveRefund,
  saveSupplier,
  saveSupplierPayment,
  setRecurringCostStatus,
  supplierPaymentSchema,
  supplierSchema,
  voidBill,
  voidSupplierPayment,
} from "@/server/purchasing";

/** Server actions for the purchasing module (spec §5.9). Abilities per spec §3.4. */

function payload(formData: FormData): Record<string, unknown> {
  try {
    return JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return {};
  }
}

function zodErrors(error: z.ZodError) {
  const fe: Record<string, string[]> = {};
  for (const i of error.issues) fe[i.path.join(".") || "form"] = [i.message];
  return failure("Please correct the highlighted fields.", fe);
}

// ---- suppliers ---------------------------------------------------------------------------

export async function saveSupplierAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let target = 0;
  const r = await guard(async () => {
    const ctx = await requireAbility(id ? "edit-supplier" : "create-supplier");
    const parsed = parseForm(supplierSchema, formData);
    if (!parsed.success) return parsed.state;
    const res = await saveSupplier(ctx, id, parsed.data);
    if (!res.ok) return failure(res.error, res.fieldErrors);
    target = res.id;
    return null;
  });
  if (r) return r;
  revalidatePath("/suppliers");
  await setFlash(id ? "Supplier updated." : "Supplier created.");
  redirect(`/suppliers/${target}`);
}

export async function deleteSupplierAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-supplier");
    const res = await deleteSupplier(ctx, id);
    if (!res.ok) return failure(res.error);
    revalidatePath("/suppliers");
    return success("Supplier deleted.");
  });
}

// ---- bills and credits ---------------------------------------------------------------------

export async function saveBillAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let target = 0;
  const raw: Record<string, unknown> = { ...payload(formData), intent: formData.get("intent") === "open" ? "open" : "draft" };
  const credit = raw.type === "SUPPLIER_CREDIT";
  const r = await guard(async () => {
    const ctx = await requireAbility(credit ? (id ? "edit-supplier-credit" : "create-supplier-credit") : id ? "edit-bill" : "create-bill");
    const parsed = billSchema.safeParse(raw);
    if (!parsed.success) return zodErrors(parsed.error);
    const res = await saveBill(ctx, id, parsed.data);
    if (!res.ok) return failure(res.error, res.fieldErrors);
    target = res.id;
    return null;
  });
  if (r) return r;
  revalidatePath("/bills");
  await setFlash(`${credit ? "Supplier credit" : "Bill"} ${id ? "updated" : "created"}.`);
  redirect(`/bills/${target}`);
}

export async function openBillAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("edit-bill");
    const res = await openBill(ctx, id);
    if (!res.ok) return failure(res.error);
    revalidatePath(`/bills/${id}`);
    return success("Bill opened. It can now be paid.");
  });
}

export async function voidBillAction(id: number, credit: boolean, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(credit ? "edit-supplier-credit" : "edit-bill");
    const res = await voidBill(ctx, id, String(formData.get("reason") ?? ""));
    if (!res.ok) return failure(res.error, res.fieldErrors);
    revalidatePath(`/bills/${id}`);
    return success(credit ? "Supplier credit voided." : "Bill voided.");
  });
}

export async function deleteBillAction(id: number, credit: boolean): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(credit ? "delete-supplier-credit" : "delete-bill");
    const res = await deleteBill(ctx, id);
    if (!res.ok) return failure(res.error);
    revalidatePath("/bills");
    return success("Deleted.");
  });
}

export async function allocateCreditAction(id: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("edit-supplier-credit");
    const raw = payload(formData);
    const rows = Array.isArray(raw.allocations) ? (raw.allocations as { billId: unknown; amount: unknown }[]) : [];
    const res = await allocateCredit(ctx, id, rows.map((a) => ({ billId: Number(a.billId), amount: toMinor(String(a.amount ?? "")) })));
    if (!res.ok) return failure(res.error, res.fieldErrors);
    revalidatePath(`/bills/${id}`);
    return success("Credit allocations saved.");
  });
}

// ---- supplier payments and refunds -------------------------------------------------------------

export async function saveSupplierPaymentAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let target = 0;
  const r = await guard(async () => {
    const ctx = await requireAbility(id ? "edit-supplier-payment" : "create-supplier-payment");
    const parsed = supplierPaymentSchema.safeParse(payload(formData));
    if (!parsed.success) return zodErrors(parsed.error);
    const res = await saveSupplierPayment(ctx, id, parsed.data);
    if (!res.ok) return failure(res.error, res.fieldErrors);
    target = res.id;
    return null;
  });
  if (r) return r;
  revalidatePath("/supplier-payments");
  await setFlash(id ? "Supplier payment updated." : "Supplier payment recorded.");
  redirect(`/supplier-payments/${target}`);
}

export async function saveRefundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let target = 0;
  const r = await guard(async () => {
    const ctx = await requireAbility("create-supplier-refund");
    const parsed = parseForm(refundSchema, formData);
    if (!parsed.success) return parsed.state;
    const res = await saveRefund(ctx, parsed.data);
    if (!res.ok) return failure(res.error, res.fieldErrors);
    target = res.id;
    return null;
  });
  if (r) return r;
  revalidatePath("/supplier-payments");
  await setFlash("Supplier refund recorded.");
  redirect(`/supplier-payments/${target}`);
}

export async function voidSupplierPaymentAction(id: number, refund: boolean, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(refund ? "edit-supplier-refund" : "edit-supplier-payment");
    const res = await voidSupplierPayment(ctx, id, String(formData.get("reason") ?? ""));
    if (!res.ok) return failure(res.error, res.fieldErrors);
    revalidatePath(`/supplier-payments/${id}`);
    return success(refund ? "Refund voided." : "Payment voided; its allocations were removed.");
  });
}

export async function deleteSupplierPaymentAction(id: number, refund: boolean): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(refund ? "delete-supplier-refund" : "delete-supplier-payment");
    const res = await deleteSupplierPayment(ctx, id);
    if (!res.ok) return failure(res.error);
    revalidatePath("/supplier-payments");
    return success("Deleted.");
  });
}

// ---- recurring costs ---------------------------------------------------------------------------

export async function saveRecurringCostAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const ctx = await requireAbility(id ? "edit-recurring-cost" : "create-recurring-cost");
    const parsed = parseForm(recurringCostSchema, formToObject(formData));
    if (!parsed.success) return parsed.state;
    const res = await saveRecurringCost(ctx, id, parsed.data);
    if (!res.ok) return failure(res.error, res.fieldErrors);
    return null;
  });
  if (r) return r;
  revalidatePath("/bills");
  await setFlash(id ? "Recurring cost updated." : "Recurring cost created.");
  redirect("/bills?tab=recurring");
}

export async function recurringCostStatusAction(id: number, action: "pause" | "resume"): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("edit-recurring-cost");
    const res = await setRecurringCostStatus(ctx, id, action);
    if (!res.ok) return failure(res.error);
    revalidatePath("/bills");
    return success(action === "pause" ? "Recurring cost paused." : "Recurring cost resumed.");
  });
}

export async function deleteRecurringCostAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-recurring-cost");
    const res = await deleteRecurringCost(ctx, id);
    if (!res.ok) return failure(res.error);
    revalidatePath("/bills");
    return success("Recurring cost deleted.");
  });
}
