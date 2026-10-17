"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, formToObject, guard, parseForm, success, type ActionState } from "@/lib/action";
import { requireSuperAdmin } from "@/lib/auth/context";
import { saveRolePreset } from "@/lib/role-presets";
import {
  adminCompanySchema,
  adminDeleteCompany,
  adminDeleteUser,
  adminSaveUser,
  adminUpdateCompany,
  adminUserSchema,
  membershipsFromForm,
} from "@/server/admin";

const zId = z.coerce.number().int().positive();

export async function adminUpdateCompanyAction(id: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireSuperAdmin();
    const parsed = parseForm(adminCompanySchema, formData);
    if (!parsed.success) return parsed.state;
    const r = await adminUpdateCompany(zId.parse(id), parsed.data);
    if (!r.ok) return failure(r.error, r.fieldErrors);
    revalidatePath("/admin", "layout");
    return success("Company updated.");
  });
}

export async function adminDeleteCompanyAction(id: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireSuperAdmin();
    const r = await adminDeleteCompany(zId.parse(id), String(formData.get("confirm") ?? ""));
    if (!r.ok) return failure(r.error, r.fieldErrors);
    revalidatePath("/admin", "layout");
    return success("Company deleted.");
  });
}

export async function adminSaveUserAction(id: number | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const actor = await requireSuperAdmin();
    const obj = formToObject(formData);
    const parsed = parseForm(adminUserSchema, { ...obj, memberships: membershipsFromForm(obj) });
    if (!parsed.success) return parsed.state;
    const r = await adminSaveUser(id, parsed.data, actor.id);
    if (!r.ok) return failure(r.error, r.fieldErrors);
    revalidatePath("/admin", "layout");
    return success(id ? "User updated." : "User created.");
  });
}

export async function adminDeleteUserAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const actor = await requireSuperAdmin();
    const r = await adminDeleteUser(zId.parse(id), actor.id);
    if (!r.ok) return failure(r.error);
    revalidatePath("/admin", "layout");
    return success("User deleted.");
  });
}

const presetSchema = z.object({
  name: z.string().optional(),
  title: z.string().trim().min(2, "Enter a preset name.").max(60),
  abilities: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.string())),
});

export async function saveRolePresetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireSuperAdmin();
    const parsed = parseForm(presetSchema, formData);
    if (!parsed.success) return parsed.state;
    const r = await saveRolePreset(parsed.data);
    if (!r.ok) return failure(r.error, { abilities: [r.error] });
    revalidatePath("/admin", "layout");
    return success("Preset saved and applied to every company.");
  });
}
