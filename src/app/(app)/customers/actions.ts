"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure, formToObject, guard, parseForm, success, type ActionState } from "@/lib/action";
import { requireAbility } from "@/lib/auth/context";
import { setFlash } from "@/lib/flash";
import { customerSchema, deleteCustomers, saveCustomer } from "@/server/customers";

export async function saveCustomerAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(id ? "edit-customer" : "create-customer");
    const parsed = parseForm(customerSchema, formToObject(formData));
    if (!parsed.success) return parsed.state;
    const res = await saveCustomer(ctx, id, parsed.data, formData);
    if (!res.ok) return failure(res.error === "you_cannot_edit_currency" ? "The currency cannot be changed after documents exist." : res.error, res.fieldErrors);
    revalidatePath("/customers");
    await setFlash(id ? "Customer updated successfully." : "Customer created successfully.");
    redirect(`/customers/${res.id}`);
  });
}

export async function deleteCustomersAction(ids: number[]): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-customer");
    const n = await deleteCustomers(ctx, ids);
    revalidatePath("/customers");
    return n ? success(n === 1 ? "Customer deleted." : `${n} customers deleted.`) : failure("Nothing was deleted.");
  });
}

export async function deleteCustomerAction(id: number): Promise<ActionState> {
  const res = await deleteCustomersAction([id]);
  if (res?.ok) {
    await setFlash("Customer deleted.");
    redirect("/customers");
  }
  return res;
}
