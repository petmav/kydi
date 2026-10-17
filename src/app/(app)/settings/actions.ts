"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, guard, parseForm, success, type ActionState } from "@/lib/action";
import { COMPANY_COOKIE, requireOwner } from "@/lib/auth/context";
import { saveCompanySettings, type SettingKey } from "@/lib/settings";
import { isCurrency } from "@/lib/intl-data";
import { companyProfileSchema, preferencesSchema, SETTINGS_SECTIONS } from "@/server/company-settings";
import { deleteStoredFile, extensionOf, IMAGE_EXTENSIONS, storeFile } from "@/lib/storage";
import { setFlash } from "@/lib/flash";
import { companyHasFinancialData, deleteCompany } from "@/lib/companies";
import { saveCustomFieldAnswers, validateCustomFieldAnswers } from "@/lib/custom-fields";

// ---- Company information ------------------------------------------------------
const companySchema = companyProfileSchema.extend({ removeLogo: z.string().optional() });

export async function updateCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const parsed = parseForm(companySchema, formData);
    if (!parsed.success) return parsed.state;
    const { removeLogo, ...data } = parsed.data;
    const dup = await db.company.findFirst({ where: { name: data.name, NOT: { id: ctx.companyId } } });
    if (dup) return failure("A company with this name already exists.", { name: ["A company with this name already exists."] });

    const cf = await validateCustomFieldAnswers(ctx.companyId, "Company", formData);
    if (!cf.ok) return failure("Please correct the highlighted fields.", cf.errors);

    let logoPath = ctx.company.logoPath;
    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > 0) {
      if (!IMAGE_EXTENSIONS.includes(extensionOf(logo.name))) return failure("Logo must be an image.", { logo: ["Upload a JPG, PNG, GIF, WebP or SVG image."] });
      if (logo.size > 2 * 1024 * 1024) return failure("Logo is too large.", { logo: ["Maximum size is 2 MB."] });
      const stored = await storeFile(`logos/${ctx.companyId}`, logo.name, Buffer.from(await logo.arrayBuffer()));
      await deleteStoredFile(logoPath);
      logoPath = stored;
    } else if (removeLogo === "on") {
      await deleteStoredFile(logoPath);
      logoPath = null;
    }
    await db.$transaction(async (tx) => {
      await tx.company.update({ where: { id: ctx.companyId }, data: { ...data, logoPath } });
      await saveCustomFieldAnswers(tx, ctx.companyId, "Company", ctx.companyId, cf.values);
    });
    revalidatePath("/", "layout");
    return success("Company information updated.");
  });
}

export async function deleteCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const confirm = String(formData.get("confirm") ?? "").trim();
    if (confirm !== ctx.company.name) return failure("Type the company name exactly to confirm.", { confirm: ["The name does not match."] });
    await deleteCompany(ctx.companyId);
    const jar = await cookies();
    jar.delete(COMPANY_COOKIE);
    await db.user.update({ where: { id: ctx.user.id }, data: { lastCompanyId: null } });
    await setFlash(`${ctx.company.name} was deleted.`);
    redirect("/dashboard");
  });
}

// ---- Preferences ----------------------------------------------------------------
const prefsSchema = preferencesSchema;

export async function updatePreferencesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const parsed = parseForm(prefsSchema, formData);
    if (!parsed.success) return parsed.state;
    const { currency, ...rest } = parsed.data;
    const values: Partial<Record<SettingKey, string>> = rest;
    if (currency && currency !== ctx.settings.currency) {
      if (!isCurrency(currency)) return failure("Choose a valid currency.", { currency: ["Choose a valid currency."] });
      if (await companyHasFinancialData(ctx.companyId)) {
        return failure("The currency cannot be changed once documents or payments exist.", { currency: ["Locked: documents exist."] });
      }
      values.currency = currency;
    }
    await saveCompanySettings(ctx.companyId, values);
    revalidatePath("/", "layout");
    return success("Preferences saved.");
  });
}

// ---- Customization / notifications / tax toggles ---------------------------------
const SECTIONS = SETTINGS_SECTIONS;


export async function saveSettingsSectionAction(section: keyof typeof SETTINGS_SECTIONS, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const schema = SECTIONS[section];
    if (!schema) return failure("Unknown settings section.");
    const parsed = parseForm(schema, formData);
    if (!parsed.success) return parsed.state;
    await saveCompanySettings(ctx.companyId, parsed.data as Partial<Record<SettingKey, string>>);
    revalidatePath("/settings", "layout");
    return success("Settings saved.");
  });
}
