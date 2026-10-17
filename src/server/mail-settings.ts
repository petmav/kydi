import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/secrets";
import { DRIVER_FIELDS, isMailDriver, parseMailConfigForm, type MailDriver } from "@/lib/mail-config";

/** Browser-safe view of a mail configuration: secrets are reduced to "is set" flags. */
export type MailConfigView = {
  exists: boolean;
  enabled: boolean;
  driver: MailDriver;
  fromAddress: string;
  fromName: string;
  options: Record<string, string>;
  secretsSet: string[];
};

async function row(companyId: number | null) {
  return companyId ? db.mailConfig.findUnique({ where: { companyId } }) : db.mailConfig.findFirst({ where: { companyId: null } });
}

export async function getMailConfigView(companyId: number | null): Promise<MailConfigView> {
  const r = await row(companyId);
  if (!r || !isMailDriver(r.driver)) {
    return { exists: false, enabled: false, driver: "smtp", fromAddress: "", fromName: "", options: {}, secretsSet: [] };
  }
  const secrets = decryptJson(r.secrets);
  const secretNames = new Set(DRIVER_FIELDS[r.driver].filter((f) => f.secret).map((f) => f.name));
  return {
    exists: true,
    enabled: r.enabled,
    driver: r.driver,
    fromAddress: r.fromAddress ?? "",
    fromName: r.fromName ?? "",
    options: (r.options ?? {}) as Record<string, string>,
    secretsSet: Object.keys(secrets).filter((k) => secretNames.has(k)),
  };
}

export async function saveMailConfig(
  companyId: number | null,
  form: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }> {
  const existing = await row(companyId);
  if (!["on", "true", "1"].includes(String(form.enabled ?? ""))) {
    // Switching the configuration off keeps the stored values for later.
    if (existing) await db.mailConfig.update({ where: { id: existing.id }, data: { enabled: false } });
    return { ok: true };
  }
  // Secrets are only carried over while the driver stays the same.
  const keep = existing && existing.driver === form.driver ? decryptJson(existing.secrets) : {};
  const parsed = parseMailConfigForm(form, keep, companyId ? "company" : "platform");
  if (!parsed.ok) return parsed;
  const v = parsed.value;
  const data = { enabled: v.enabled, driver: v.driver, fromAddress: v.fromAddress, fromName: v.fromName, options: v.options, secrets: encryptJson(v.secrets) };
  if (existing) await db.mailConfig.update({ where: { id: existing.id }, data });
  else await db.mailConfig.create({ data: { ...data, companyId } });
  return { ok: true };
}
