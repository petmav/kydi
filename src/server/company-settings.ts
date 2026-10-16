import { z } from "zod";
import { zOptionalString } from "@/lib/action";
import { isTimezone } from "@/lib/intl-data";
import { validateNumberFormat } from "@/domain/numbering";
import type { SettingKey } from "@/lib/settings";

/** Validation for company profile and the settings sheet (spec §3.2, §5.12). Shared by settings pages and the API. */

export const yesNo = z
  .union([z.literal("on"), z.literal("YES"), z.literal("true"), z.literal("NO"), z.literal(""), z.literal("false"), z.boolean()])
  .optional()
  .transform((v) => (v === "on" || v === "YES" || v === "true" || v === true ? "YES" : "NO"));

export const companyProfileSchema = z.object({
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
});

export const preferencesSchema = z.object({
  currency: z.string().optional(),
  language: z.string().min(2),
  locale: z.string().min(2),
  time_zone: z.string().refine(isTimezone, "Choose a valid time zone."),
  date_format: z.string().min(1),
  fiscal_year: z.string().regex(/^\d{1,2}-\d{1,2}$/),
  discount_per_item: yesNo,
  invoice_use_time: yesNo,
  automatically_expire_public_links: yesNo,
  link_expiry_days: z.coerce.number().int().min(1, "At least 1 day.").max(365).transform(String),
});

const numberFormat = z
  .string()
  .trim()
  .superRefine((v, c) => {
    const err = validateNumberFormat(v);
    if (err) c.addIssue({ code: z.ZodIssueCode.custom, message: err });
  });
const html = z.string().max(65000);
const days = z.coerce.number().int().min(0).max(365).transform(String);

export const SETTINGS_SECTIONS = {
  invoices: z.object({
    invoice_number_format: numberFormat,
    credit_note_number_format: numberFormat,
    invoice_set_due_date_automatically: yesNo,
    invoice_due_date_days: days,
    retrospective_edits: z.enum(["allow", "disable_on_invoice_sent", "disable_on_invoice_partial_paid", "disable_on_invoice_paid"]),
    invoice_email_attachment: yesNo,
    invoice_company_address_format: html,
    invoice_billing_address_format: html,
    invoice_shipping_address_format: html,
  }),
  estimates: z.object({
    estimate_number_format: numberFormat,
    estimate_set_expiry_date_automatically: yesNo,
    estimate_expiry_date_days: days,
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

export type SettingsSection = keyof typeof SETTINGS_SECTIONS;

/** Keys that may be written through the generic settings endpoint (currency has its own lock rules). */
const PATCH_SHAPE: Record<string, z.ZodTypeAny> = {
  ...Object.values(SETTINGS_SECTIONS).reduce((acc, s) => ({ ...acc, ...s.shape }), {} as Record<string, z.ZodTypeAny>),
  ...preferencesSchema.omit({ currency: true }).shape,
};
export const SETTABLE_KEYS = Object.keys(PATCH_SHAPE);

/** Validates a partial settings map. Unknown keys are reported, not silently dropped. */
export function validateSettingsPatch(values: Record<string, unknown>):
  | { ok: true; values: Partial<Record<SettingKey, string>> }
  | { ok: false; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    const schema = PATCH_SHAPE[k];
    if (!schema) {
      errors[k] = ["Unknown or read-only setting."];
      continue;
    }
    const r = schema.safeParse(typeof v === "number" ? String(v) : v);
    if (!r.success) errors[k] = r.error.issues.map((i) => i.message);
    else out[k] = String(r.data);
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values: out as Partial<Record<SettingKey, string>> };
}
