"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, formToObject, guard, parseForm, success, type ActionState } from "@/lib/action";
import { requireSuperAdmin } from "@/lib/auth/context";
import { saveRolePreset } from "@/lib/role-presets";
import { saveMailConfig } from "@/server/mail-settings";
import { sendPlatformMail } from "@/server/mailer";
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

/** Spec §5.13 Settings › Mail configuration: platform default used by companies without their own. */
export async function savePlatformMailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireSuperAdmin();
    const r = await saveMailConfig(null, formToObject(formData));
    if (!r.ok) return failure(r.error, r.fieldErrors);
    revalidatePath("/admin/mail");
    return success("Platform mail configuration saved.");
  });
}

const testSchema = z.object({
  to: z.string().trim().toLowerCase().email("Enter a valid email address."),
  subject: z.string().trim().min(1, "Enter a subject.").max(255),
  message: z.string().trim().min(1, "Enter a message.").max(5000),
});

export async function sendPlatformTestMailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireSuperAdmin();
    const parsed = parseForm(testSchema, formData);
    if (!parsed.success) return parsed.state;
    try {
      const res = await sendPlatformMail({
        to: parsed.data.to,
        subject: parsed.data.subject,
        html: `<p>${parsed.data.message.replace(/[<>&]/g, "").replace(/\n/g, "<br>")}</p><p>Sent by Kydi administration.</p>`,
      });
      return success(res.delivered ? `Test email sent via ${res.transport}.` : "No mail server is configured: the email was written to the server log.");
    } catch (err) {
      return failure(`Sending failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  });
}
