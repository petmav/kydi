"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure, guard, success, type ActionState } from "@/lib/action";
import { requireAbility } from "@/lib/auth/context";
import { setFlash } from "@/lib/flash";
import { deleteExpenses, expenseSchema, saveExpense } from "@/server/expenses";

export async function saveExpenseAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(id ? "edit-expense" : "create-expense");
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(String(formData.get("payload") ?? "{}"));
    } catch {
      /* schema reports */
    }
    const parsed = expenseSchema.safeParse({ ...raw, removeReceipt: formData.get("removeReceipt") ?? undefined });
    if (!parsed.success) {
      const fe: Record<string, string[]> = {};
      for (const i of parsed.error.issues) fe[i.path.join(".") || "amount"] = [i.message];
      return failure("Please correct the highlighted fields.", fe);
    }
    const file = formData.get("receipt");
    const res = await saveExpense(ctx, id, parsed.data, file instanceof File ? file : null, formData);
    if (!res.ok) return failure(res.error, res.fieldErrors);
    revalidatePath("/expenses");
    await setFlash(id ? "Expense updated successfully." : "Expense created successfully.");
    redirect("/expenses");
  });
}

export async function deleteExpensesAction(ids: number[]): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-expense");
    const n = await deleteExpenses(ctx, ids);
    revalidatePath("/expenses");
    return n ? success(n === 1 ? "Expense deleted." : `${n} expenses deleted.`) : failure("Nothing was deleted.");
  });
}
