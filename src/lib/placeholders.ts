/** Template placeholders ({NAME}) used in address formats, notes and email bodies. */

export const COMPANY_PLACEHOLDERS = [
  "COMPANY_NAME",
  "COMPANY_ADDRESS_STREET_1",
  "COMPANY_ADDRESS_STREET_2",
  "COMPANY_CITY",
  "COMPANY_STATE",
  "COMPANY_COUNTRY",
  "COMPANY_ZIP_CODE",
  "COMPANY_PHONE",
  "COMPANY_VAT",
  "COMPANY_TAX",
];
export const CUSTOMER_PLACEHOLDERS = ["CONTACT_DISPLAY_NAME", "PRIMARY_CONTACT_NAME", "CONTACT_EMAIL", "CONTACT_PHONE", "CONTACT_WEBSITE", "CONTACT_TAX_ID"];
const addr = (p: string) => [`${p}_ADDRESS_NAME`, `${p}_ADDRESS_STREET_1`, `${p}_ADDRESS_STREET_2`, `${p}_CITY`, `${p}_STATE`, `${p}_COUNTRY`, `${p}_ZIP_CODE`, `${p}_PHONE`];
export const BILLING_PLACEHOLDERS = addr("BILLING");
export const SHIPPING_PLACEHOLDERS = addr("SHIPPING");
export const INVOICE_PLACEHOLDERS = ["INVOICE_NUMBER", "INVOICE_DATE", "INVOICE_DUE_DATE", "INVOICE_REF_NUMBER", "INVOICE_TOTAL", "INVOICE_DUE_AMOUNT"];
export const ESTIMATE_PLACEHOLDERS = ["ESTIMATE_NUMBER", "ESTIMATE_DATE", "ESTIMATE_EXPIRY_DATE", "ESTIMATE_REF_NUMBER", "ESTIMATE_TOTAL"];
export const PAYMENT_PLACEHOLDERS = ["PAYMENT_NUMBER", "PAYMENT_DATE", "PAYMENT_MODE", "PAYMENT_AMOUNT"];

/** Replaces {TOKENS}; unknown tokens are removed (spec §4.11). Empty paragraphs left behind are dropped. */
export function fillPlaceholders(template: string, values: Record<string, string | null | undefined>, escape = true): string {
  const esc = (s: string) => (escape ? s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!) : s);
  return template
    .replace(/\{([A-Z0-9_]+)\}/g, (_, key: string) => esc(values[key] ?? ""))
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/<h3>\s*<\/h3>/g, "");
}

type CompanyLike = {
  name: string;
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip?: string | null;
  phone?: string | null;
  vatId?: string | null;
  taxId?: string | null;
};

type CustomerLike = {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  taxId?: string | null;
  [k: string]: unknown;
};

export function companyValues(c: CompanyLike, countryName: (code: string | null | undefined) => string | null) {
  return {
    COMPANY_NAME: c.name,
    COMPANY_ADDRESS_STREET_1: c.street1,
    COMPANY_ADDRESS_STREET_2: c.street2,
    COMPANY_CITY: c.city,
    COMPANY_STATE: c.state,
    COMPANY_COUNTRY: countryName(c.country),
    COMPANY_ZIP_CODE: c.zip,
    COMPANY_PHONE: c.phone,
    COMPANY_VAT: c.vatId,
    COMPANY_TAX: c.taxId,
  };
}

export function customerValues(c: CustomerLike, countryName: (code: string | null | undefined) => string | null) {
  const s = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : null);
  const block = (prefix: "billing" | "shipping", P: string) => ({
    [`${P}_ADDRESS_NAME`]: s(`${prefix}Name`),
    [`${P}_ADDRESS_STREET_1`]: s(`${prefix}Street1`),
    [`${P}_ADDRESS_STREET_2`]: s(`${prefix}Street2`),
    [`${P}_CITY`]: s(`${prefix}City`),
    [`${P}_STATE`]: s(`${prefix}State`),
    [`${P}_COUNTRY`]: countryName(s(`${prefix}Country`)),
    [`${P}_ZIP_CODE`]: s(`${prefix}Zip`),
    [`${P}_PHONE`]: s(`${prefix}Phone`),
  });
  return {
    CONTACT_DISPLAY_NAME: c.name,
    PRIMARY_CONTACT_NAME: c.contactName,
    CONTACT_EMAIL: c.email,
    CONTACT_PHONE: c.phone,
    CONTACT_WEBSITE: c.website,
    CONTACT_TAX_ID: c.taxId,
    ...block("billing", "BILLING"),
    ...block("shipping", "SHIPPING"),
  };
}
