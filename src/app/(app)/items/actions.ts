"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failure, formToObject, guard, parseForm, success, type ActionState } from "@/lib/action";
import { requireAbility } from "@/lib/auth/context";
import { setFlash } from "@/lib/flash";
import { db } from "@/lib/db";
import { plain } from "@/lib/money";
import { deleteItems, itemSchema, saveItem } from "@/server/items";

export async function saveItemAction(id: number | null, inline: boolean, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(id ? "edit-item" : "create-item");
    const parsed = parseForm(itemSchema, formToObject(formData));
    if (!parsed.success) return parsed.state;
    const res = await saveItem(ctx, id, parsed.data, formData);
    if (!res.ok) return failure(res.error, res.fieldErrors);
    revalidatePath("/items");
    if (inline) {
      const item = plain(await db.item.findUnique({ where: { id: res.id }, include: { unit: true, taxes: { include: { taxType: true } } } }));
      return success("Item created.", { item });
    }
    await setFlash(id ? "Item updated successfully." : "Item created successfully.");
    redirect("/items");
  });
}

export async function deleteItemsAction(ids: number[]): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("delete-item");
    const n = await deleteItems(ctx, ids);
    revalidatePath("/items");
    return n ? success(n === 1 ? "Item deleted." : `${n} items deleted.`) : failure("Nothing was deleted.");
  });
}
