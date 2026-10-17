import { isPublicHostname } from "@/lib/net";

/** Mail driver catalogue and form parsing (spec §5.12 "Mail configuration"). Pure: no I/O. */

export const MAIL_DRIVERS = ["smtp", "mailgun", "ses", "postmark", "sendmail", "mail"] as const;
export type MailDriver = (typeof MAIL_DRIVERS)[number];

export const DRIVER_LABELS: Record<MailDriver, string> = {
  smtp: "SMTP",
  mailgun: "Mailgun",
  ses: "Amazon SES",
  postmark: "Postmark",
  sendmail: "Sendmail",
  mail: "Mail (local sendmail binary)",
};

export type MailField = {
  name: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  defaultValue?: string;
};

export const MAILGUN_ENDPOINTS = [
  { value: "api.mailgun.net", label: "api.mailgun.net (US)" },
  { value: "api.eu.mailgun.net", label: "api.eu.mailgun.net (EU)" },
];

export const SMTP_ENCRYPTION = [
  { value: "none", label: "None" },
  { value: "tls", label: "TLS" },
  { value: "ssl", label: "SSL" },
  { value: "starttls", label: "STARTTLS" },
];

export const DRIVER_FIELDS: Record<MailDriver, MailField[]> = {
  smtp: [
    { name: "host", label: "Host", required: true },
    { name: "port", label: "Port", required: true, type: "number", defaultValue: "587" },
    { name: "username", label: "Username" },
    { name: "password", label: "Password", secret: true },
    { name: "encryption", label: "Encryption", type: "select", options: SMTP_ENCRYPTION, defaultValue: "starttls" },
  ],
  mailgun: [
    { name: "domain", label: "Domain", required: true },
    { name: "secret", label: "API key", required: true, secret: true },
    { name: "endpoint", label: "Endpoint", required: true, type: "select", options: MAILGUN_ENDPOINTS, defaultValue: "api.mailgun.net" },
  ],
  ses: [
    { name: "key", label: "Access key ID", required: true },
    { name: "secret", label: "Secret access key", required: true, secret: true },
    { name: "region", label: "Region", required: true, defaultValue: "us-east-1" },
  ],
  postmark: [{ name: "token", label: "Server token", required: true, secret: true }],
  sendmail: [],
  mail: [],
};

export type MailConfigValue = {
  enabled: boolean;
  driver: MailDriver;
  fromAddress: string | null;
  fromName: string | null;
  options: Record<string, string>;
  secrets: Record<string, string>;
};

type Result = { ok: true; value: MailConfigValue } | { ok: false; error: string; fieldErrors: Record<string, string[]> };

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isMailDriver(v: unknown): v is MailDriver {
  return typeof v === "string" && (MAIL_DRIVERS as readonly string[]).includes(v);
}

/**
 * Validates a submitted mail form. Secret inputs left blank keep `existingSecrets` (the browser never
 * receives stored secrets). `scope = "company"` additionally refuses private SMTP hosts.
 */
export function parseMailConfigForm(obj: Record<string, unknown>, existingSecrets: Record<string, string>, scope: "company" | "platform"): Result {
  const str = (k: string) => (typeof obj[k] === "string" ? (obj[k] as string).trim() : "");
  const enabled = ["on", "true", "1"].includes(str("enabled"));
  const driver = str("driver");
  const errors: Record<string, string[]> = {};
  if (!isMailDriver(driver)) return { ok: false, error: "Choose a mail driver.", fieldErrors: { driver: ["Choose a mail driver."] } };
  const fromAddress = str("fromAddress") || null;
  const fromName = str("fromName") || null;
  if (driver === "smtp" && !fromAddress) errors.fromAddress = ["Enter the sender address."];
  if (driver === "smtp" && !fromName) errors.fromName = ["Enter the sender name."];
  if (fromAddress && !EMAIL.test(fromAddress)) errors.fromAddress = ["Enter a valid email address."];
  if (fromName && fromName.length > 120) errors.fromName = ["Use at most 120 characters."];
  const options: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const f of DRIVER_FIELDS[driver]) {
    const raw = str(f.name);
    const value = f.secret ? raw || existingSecrets[f.name] || "" : raw;
    if (f.required && !value) {
      errors[f.name] = [`Enter the ${f.label.toLowerCase()}.`];
      continue;
    }
    if (value.length > 500) errors[f.name] = ["Value is too long."];
    if (f.options && value && !f.options.some((o) => o.value === value)) errors[f.name] = ["Choose a valid option."];
    if (f.secret) {
      if (value) secrets[f.name] = value;
    } else if (value) options[f.name] = value;
  }
  if (driver === "smtp") {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = ["Enter a port between 1 and 65535."];
    if (options.host && !/^[a-zA-Z0-9.-]+$/.test(options.host)) errors.host = ["Enter a host name without scheme or path."];
    else if (options.host && scope === "company" && !isPublicHostname(options.host)) errors.host = ["Use a public mail server host name."];
  }
  if (driver === "ses" && options.region && !/^[a-z]{2}(-[a-z]+)+-\d$/.test(options.region)) errors.region = ["Enter an AWS region such as eu-west-1."];
  if (driver === "mailgun" && options.domain && !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(options.domain)) errors.domain = ["Enter a domain such as mg.example.com."];
  if (Object.keys(errors).length) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: errors };
  return { ok: true, value: { enabled, driver, fromAddress, fromName, options, secrets } };
}

/** "Name <address>" or the bare address. */
export function formatFrom(address: string | null | undefined, name: string | null | undefined, fallback: string): string {
  if (!address) return fallback;
  const n = (name ?? "").replace(/["<>\r\n]/g, "").trim();
  return n ? `"${n}" <${address}>` : address;
}
