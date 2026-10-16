"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, guard, success, type ActionState } from "@/lib/action";
import { getCompanyContext, requireAbility } from "@/lib/auth/context";
import { setFlash } from "@/lib/flash";
import { toMinor } from "@/lib/money";
import { applyCredit, deletePayments, openInvoices, paymentSchema, savePayment } from "@/server/payments";

export async function savePaymentAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(id ? "edit-payment" : "create-payment");
    let raw: unknown = {};
    try {
      raw = JSON.parse(String(formData.get("payload") ?? "{}"));
    } catch {
      /* schema reports */
    }
    const parsed = paymentSchema.safeParse(raw);
    if (!parsed.success) {
      const fe: Record<string, string[]> = {};
      for (const i of parsed.error.issues) fe[i.path.join(".") || "amount"] = [i.message];
      return failure("Please correct the highlighted fields.", fe);
    }
    const res = await savePayment(ctx, id, parsed.data, formData);
    if (!res.ok) return failure(res.error, res.fieldErrors);
    revalidatePath("/payments");
    revalidatePath("/invoices");
    await setFlash(id ? "Payment updated successfully." : "Payment recorded successfully.");
    redirect(`/payments/${res.id}`);
  });
}

export async function deletePaymentsAction(ids: number[]): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-payment");
    const n = await deletePayments(ctx, ids);
    revalidatePath("/payments");
    revalidatePath("/invoices");
    return n ? success(n === 1 ? "Payment deleted." : `${n} payments deleted.`) : failure("Nothing was deleted.");
  });
}

export async function deletePaymentAction(id: number): Promise<ActionState> {
  const r = await deletePaymentsAction([id]);
  if (r?.ok) {
    await setFlash("Payment deleted.");
    redirect("/payments");
  }
  return r;
}

export async function openInvoicesAction(customerId: number, paymentId: number | null) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-invoice")) return [];
  const c = await db.customer.findFirst({ where: { id: customerId, companyId: ctx.companyId }, select: { id: true } });
  return c ? openInvoices(ctx.companyId, c.id, paymentId ?? undefined) : [];
}

const creditRows = z.array(z.object({ paymentId: z.coerce.number().int().positive(), invoiceId: z.coerce.number().int().positive(), amount: z.string() }));

export async function applyCreditAction(customerId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("edit-payment");
    let rows;
    try {
      rows = creditRows.parse(JSON.parse(String(formData.get("payload") ?? "[]")));
    } catch {
      return failure("Add valid allocation rows.");
    }
    const minor = rows.map((r) => ({ ...r, amount: toMinor(r.amount) }));
    if (minor.some((r) => !Number.isInteger(r.amount) || r.amount < 1)) return failure("Each amount must be greater than 0.");
    const res = await applyCredit(ctx, customerId, minor);
    if (!res.ok) return failure(res.error);
    revalidatePath(`/customers/${customerId}`);
    await setFlash("Credit applied.");
    redirect(`/customers/${customerId}`);
  });
}
