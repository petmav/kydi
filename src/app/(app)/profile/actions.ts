"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, guard, parseForm, success, zEmail, zPassword, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/auth/context";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { destroyAllSessions } from "@/lib/auth/session";
import { AVATAR_EXTENSIONS, deleteStoredFile, extensionOf, sniffImage, storeFile } from "@/lib/storage";

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

/** Profile photo upload/remove (spec §2.6). Stored under UPLOAD_DIR/avatars, served by an authenticated route. */
export async function updateAvatarAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const file = formData.get("avatar");
    if (formData.get("remove") === "1") {
      await deleteStoredFile(user.avatarPath);
      await db.user.update({ where: { id: user.id }, data: { avatarPath: null } });
      revalidatePath("/", "layout");
      return success("Profile photo removed.");
    }
    if (!(file instanceof File) || file.size === 0) return failure("Choose an image to upload.", { avatar: ["Choose an image."] });
    if (!AVATAR_EXTENSIONS.includes(extensionOf(file.name))) return failure("Unsupported file type.", { avatar: ["Upload a JPG, PNG, GIF or WebP image."] });
    if (file.size > 2 * 1024 * 1024) return failure("Image is too large.", { avatar: ["Maximum size is 2 MB."] });
    const data = Buffer.from(await file.arrayBuffer());
    const kind = sniffImage(data);
    if (!kind) return failure("The file is not a valid image.", { avatar: ["Upload a JPG, PNG, GIF or WebP image."] });
    const stored = await storeFile(`avatars/${user.id}`, `avatar.${kind}`, data);
    await deleteStoredFile(user.avatarPath);
    await db.user.update({ where: { id: user.id }, data: { avatarPath: stored } });
    revalidatePath("/", "layout");
    return success("Profile photo updated.");
  });
}
