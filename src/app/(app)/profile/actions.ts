"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, guard, parseForm, success, zEmail, zPassword, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/auth/context";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { destroyAllSessions } from "@/lib/auth/session";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  email: zEmail,
});

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const parsed = parseForm(profileSchema, formData);
    if (!parsed.success) return parsed.state;
    const { name, email } = parsed.data;
    if (email !== user.email && (await db.user.findUnique({ where: { email } }))) {
      return failure("That email is already in use.", { email: ["That email is already in use."] });
    }
    await db.user.update({ where: { id: user.id }, data: { name, email } });
    revalidatePath("/", "layout");
    return success("Profile updated.");
  });
}

const passwordSchema = z
  .object({ current: z.string().min(1, "Enter your current password."), password: zPassword, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match." });

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const parsed = parseForm(passwordSchema, formData);
    if (!parsed.success) return parsed.state;
    if (!(await verifyPassword(user.passwordHash, parsed.data.current))) {
      return failure("Current password is incorrect.", { current: ["Current password is incorrect."] });
    }
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } });
    await destroyAllSessions(user.id, true);
    return success("Password changed. Other sessions were signed out.");
  });
}

export async function signOutOtherSessionsAction(): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    await destroyAllSessions(user.id, true);
    revalidatePath("/profile");
    return success("Signed out of all other sessions.");
  });
}
