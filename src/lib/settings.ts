import { cache } from "react";
import { db, type Tx } from "@/lib/db";

const COMPANY_ADDRESS = `<p><strong>{COMPANY_NAME}</strong></p><p>{COMPANY_ADDRESS_STREET_1}</p><p>{COMPANY_ADDRESS_STREET_2}</p><p>{COMPANY_CITY} {COMPANY_STATE}</p><p>{COMPANY_COUNTRY} {COMPANY_ZIP_CODE}</p><p>{COMPANY_PHONE}</p>`;
const BILLING_ADDRESS = `<h3>{BILLING_ADDRESS_NAME}</h3><p>{BILLING_ADDRESS_STREET_1}</p><p>{BILLING_ADDRESS_STREET_2}</p><p>{BILLING_CITY} {BILLING_STATE}</p><p>{BILLING_COUNTRY} {BILLING_ZIP_CODE}</p><p>{BILLING_PHONE}</p>`;
const SHIPPING_ADDRESS = `<h3>{SHIPPING_ADDRESS_NAME}</h3><p>{SHIPPING_ADDRESS_STREET_1}</p><p>{SHIPPING_ADDRESS_STREET_2}</p><p>{SHIPPING_CITY} {SHIPPING_STATE}</p><p>{SHIPPING_COUNTRY} {SHIPPING_ZIP_CODE}</p><p>{SHIPPING_PHONE}</p>`;
const FROM_CUSTOMER = `<h3>{BILLING_ADDRESS_NAME}</h3><p>{BILLING_ADDRESS_STREET_1}</p><p>{BILLING_ADDRESS_STREET_2}</p><p>{BILLING_CITY} {BILLING_STATE} {BILLING_ZIP_CODE}</p><p>{BILLING_COUNTRY}</p><p>{BILLING_PHONE}</p>`;

/** Company settings sheet (spec §3.2). Booleans use YES / NO. */
export const SETTING_DEFAULTS = {
  currency: "USD",
  time_zone: "UTC",
  language: "en",
  locale: "en-US",
  fiscal_year: "1-12",
  date_format: "yyyy-MM-dd",
  invoice_use_time: "NO",
  notification_email: "no-reply@kydi.local",
  notify_invoice_viewed: "NO",
  notify_estimate_viewed: "NO",
  tax_per_item: "NO",
  discount_per_item: "NO",
  tax_included: "NO",
  tax_included_by_default: "NO",
  invoice_email_attachment: "NO",
  estimate_email_attachment: "NO",
  payment_email_attachment: "NO",
  invoice_mail_subject: "New Invoice {INVOICE_NUMBER} from {COMPANY_NAME}",
  estimate_mail_subject: "New Estimate {ESTIMATE_NUMBER} from {COMPANY_NAME}",
  payment_mail_subject: "Payment Receipt {PAYMENT_NUMBER} from {COMPANY_NAME}",
  invoice_mail_body:
    "<p>Hello {CONTACT_DISPLAY_NAME},</p><p>You have received a new invoice from <strong>{COMPANY_NAME}</strong>.</p><p>Please use the button below to view it.</p>",
  estimate_mail_body:
    "<p>Hello {CONTACT_DISPLAY_NAME},</p><p>You have received a new estimate from <strong>{COMPANY_NAME}</strong>.</p><p>Please use the button below to review it.</p>",
  payment_mail_body:
    "<p>Hello {CONTACT_DISPLAY_NAME},</p><p>Thank you for your payment to <strong>{COMPANY_NAME}</strong>.</p><p>Please use the button below to view your receipt.</p>",
  invoice_company_address_format: COMPANY_ADDRESS,
  invoice_billing_address_format: BILLING_ADDRESS,
  invoice_shipping_address_format: SHIPPING_ADDRESS,
  estimate_company_address_format: COMPANY_ADDRESS,
  estimate_billing_address_format: BILLING_ADDRESS,
  estimate_shipping_address_format: SHIPPING_ADDRESS,
  payment_company_address_format: COMPANY_ADDRESS,
  payment_from_customer_address_format: FROM_CUSTOMER,
  invoice_number_format: "{{SERIES:INV}}{{DELIMITER:-}}{{SEQUENCE:6}}",
  credit_note_number_format: "{{SERIES:CN}}{{DELIMITER:-}}{{SEQUENCE:6}}",
  estimate_number_format: "{{SERIES:EST}}{{DELIMITER:-}}{{SEQUENCE:6}}",
  payment_number_format: "{{SERIES:PAY}}{{DELIMITER:-}}{{SEQUENCE:6}}",
  bill_number_format: "{{SERIES:BILL}}{{DELIMITER:-}}{{SEQUENCE:6}}",
  supplier_credit_number_format: "{{SERIES:SC}}{{DELIMITER:-}}{{SEQUENCE:6}}",
  supplier_payment_number_format: "{{SERIES:SP}}{{DELIMITER:-}}{{SEQUENCE:6}}",
  supplier_refund_number_format: "{{SERIES:SR}}{{DELIMITER:-}}{{SEQUENCE:6}}",
  invoice_set_due_date_automatically: "YES",
  invoice_due_date_days: "7",
  estimate_set_expiry_date_automatically: "YES",
  estimate_expiry_date_days: "7",
  estimate_convert_action: "no_action",
  retrospective_edits: "allow",
  automatically_expire_public_links: "YES",
  link_expiry_days: "7",
  default_invoice_template: "invoice1",
  default_estimate_template: "estimate1",
  customer_portal_page_title: "",
  /** Sending an invoice switches the customer's portal access on and emails a setup link (YES/NO). */
  auto_portal_access: "YES",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type CompanySettings = { [K in SettingKey]: string };

export const yes = (v: string | undefined) => v === "YES";

export const getCompanySettings = cache(async (companyId: number): Promise<CompanySettings> => {
  const rows = await db.companySetting.findMany({ where: { companyId } });
  const out: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out as CompanySettings;
});

export async function saveCompanySettings(
  companyId: number,
  values: Partial<Record<SettingKey, string>>,
  tx: Tx = db,
) {
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== "string") continue;
    await tx.companySetting.upsert({
      where: { companyId_key: { companyId, key } },
      create: { companyId, key, value },
      update: { value },
    });
  }
}

export const FISCAL_YEARS = Array.from({ length: 12 }, (_, i) => {
  const start = i + 1;
  const end = start === 1 ? 12 : start - 1;
  const m = (n: number) => new Date(2000, n - 1, 1).toLocaleString("en", { month: "long" });
  return { value: `${start}-${end}`, label: `${m(start)} – ${m(end)}` };
});

export const RETROSPECTIVE_EDITS = [
  { value: "allow", label: "Allow editing any invoice" },
  { value: "disable_on_invoice_sent", label: "Disable after a payment is recorded (sent invoices)" },
  { value: "disable_on_invoice_partial_paid", label: "Disable once partially paid" },
  { value: "disable_on_invoice_paid", label: "Disable once fully paid" },
];

export const CONVERT_ACTIONS = [
  { value: "no_action", label: "Keep the estimate unchanged" },
  { value: "mark_estimate_as_accepted", label: "Mark the estimate as accepted" },
  { value: "delete_estimate", label: "Delete the estimate" },
];
