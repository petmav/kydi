"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { failure, guard, parseForm, type ActionState } from "@/lib/action";
import { requireOwner } from "@/lib/auth/context";
import { setFlash } from "@/lib/flash";
import { transferOwnership } from "@/server/team";

const schema = z.object({ userId: z.coerce.number().int().positive("Choose a member."), confirm: z.string().trim() });

/** Spec §2.5: owner hands the company to another member; the previous owner stays as a member. */
export async function transferOwnershipAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let target = "";
  const result = await guard(async () => {
    const ctx = await requireOwner();
    const parsed = parseForm(schema, formData);
    if (!parsed.success) return parsed.state;
    if (parsed.data.confirm !== ctx.company.name) {
      return failure("Type the company name exactly to confirm.", { confirm: ["Does not match the company name."] });
    }
    const r = await transferOwnership(ctx, parsed.data.userId);
    if (!r.ok) return failure(r.error, r.fieldErrors);
    target = ctx.company.name;
    return null;
  });
  if (result) return result;
  await setFlash(`Ownership of ${target} was transferred.`);
  redirect("/dashboard");
}
