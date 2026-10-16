"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, guard, parseForm, success, zOptionalString, type ActionState } from "@/lib/action";
import { COMPANY_COOKIE, requireOwner } from "@/lib/auth/context";
import { saveCompanySettings, type SettingKey } from "@/lib/settings";
import { isCurrency, isTimezone } from "@/lib/intl-data";
import { validateNumberFormat } from "@/domain/numbering";
import { deleteStoredFile, extensionOf, IMAGE_EXTENSIONS, storeFile } from "@/lib/storage";
import { setFlash } from "@/lib/flash";
import { companyHasFinancialData } from "@/lib/companies";
import { saveCustomFieldAnswers, validateCustomFieldAnswers } from "@/lib/custom-fields";

const yesNo = z
  .union([z.literal("on"), z.literal("YES"), z.literal("true"), z.literal("NO"), z.literal("")])
  .optional()
  .transform((v) => (v === "on" || v === "YES" || v === "true" ? "YES" : "NO"));

// ---- Company information ------------------------------------------------------
const companySchema = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(120),
  vatId: zOptionalString,
  taxId: zOptionalString,
  phone: zOptionalString,
  country: z.string().trim().min(2, "Choose a country."),
  state: zOptionalString,
  city: zOptionalString,
  zip: zOptionalString,
  street1: zOptionalString,
  street2: zOptionalString,
  removeLogo: z.string().optional(),
});

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
    if (ctx.memberships.length <= 1) return failure("You cannot delete your last remaining company.");
    await db.company.delete({ where: { id: ctx.companyId } });
    const jar = await cookies();
    jar.delete(COMPANY_COOKIE);
    await db.user.update({ where: { id: ctx.user.id }, data: { lastCompanyId: null } });
    await setFlash(`${ctx.company.name} was deleted.`);
    redirect("/dashboard");
  });
}

// ---- Preferences ----------------------------------------------------------------
const prefsSchema = z.object({
  currency: z.string().optional(),
  language: z.string().min(2),
  locale: z.string().min(2),
  time_zone: z.string().refine(isTimezone, "Choose a valid time zone."),
  date_format: z.string().min(1),
  fiscal_year: z.string().regex(/^\d{1,2}-\d{1,2}$/),
  discount_per_item: yesNo,
  automatically_expire_public_links: yesNo,
  link_expiry_days: z.coerce.number().int().min(1, "At least 1 day.").max(365).transform(String),
});

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
const numberFormat = z.string().trim().superRefine((v, c) => {
  const err = validateNumberFormat(v);
  if (err) c.addIssue({ code: z.ZodIssueCode.custom, message: err });
});
const html = z.string().max(65000);

const SECTIONS = {
  invoices: z.object({
    invoice_number_format: numberFormat,
    credit_note_number_format: numberFormat,
    invoice_set_due_date_automatically: yesNo,
    invoice_due_date_days: z.coerce.number().int().min(0).max(365).transform(String),
    retrospective_edits: z.enum(["allow", "disable_on_invoice_sent", "disable_on_invoice_partial_paid", "disable_on_invoice_paid"]),
    invoice_email_attachment: yesNo,
    invoice_company_address_format: html,
    invoice_billing_address_format: html,
    invoice_shipping_address_format: html,
  }),
  estimates: z.object({
    estimate_number_format: numberFormat,
    estimate_set_expiry_date_automatically: yesNo,
    estimate_expiry_date_days: z.coerce.number().int().min(0).max(365).transform(String),
    estimate_convert_action: z.enum(["no_action", "delete_estimate", "mark_estimate_as_accepted"]),
    estimate_email_attachment: yesNo,
    estimate_company_address_format: html,
    estimate_billing_address_format: html,
    estimate_shipping_address_format: html,
  }),
  payments: z.object({
    payment_number_format: numberFormat,
    payment_email_attachment: yesNo,
    payment_company_address_format: html,
    payment_from_customer_address_format: html,
  }),
  emails: z.object({
    invoice_mail_subject: z.string().trim().min(1, "Enter a subject.").max(255),
    invoice_mail_body: html,
    estimate_mail_subject: z.string().trim().min(1, "Enter a subject.").max(255),
    estimate_mail_body: html,
    payment_mail_subject: z.string().trim().min(1, "Enter a subject.").max(255),
    payment_mail_body: html,
  }),
  notifications: z.object({
    notification_email: z.string().trim().email("Enter a valid email address."),
    notify_invoice_viewed: yesNo,
    notify_estimate_viewed: yesNo,
  }),
  taxes: z.object({
    tax_per_item: yesNo,
    tax_included: yesNo,
    tax_included_by_default: yesNo,
  }),
  portal: z.object({
    customer_portal_page_title: z.string().trim().max(120),
  }),
} as const;

export type SettingsSection = keyof typeof SECTIONS;

export async function saveSettingsSectionAction(section: SettingsSection, _prev: ActionState, formData: FormData): Promise<ActionState> {
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
