import type { CustomField, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { FieldErrors } from "@/lib/action";

/** Custom field definitions + answers, spec §3.14. Answers are stored as normalised text. */

export const CF_MODELS = ["Customer", "Invoice", "Estimate", "Payment", "Expense", "Item", "Company"] as const;
export type CfModel = (typeof CF_MODELS)[number];
export const CF_TYPES = ["Input", "TextArea", "Phone", "Url", "Number", "Dropdown", "Switch", "Date", "Time", "DateTime"] as const;
export type CfType = (typeof CF_TYPES)[number];

export type CfValidation = {
  min_length?: number | null;
  max_length?: number | null;
  min?: number | null;
  max?: number | null;
  earliest?: string | null;
  latest?: string | null;
  pattern?: string | null;
};

export type CustomFieldDef = Pick<
  CustomField,
  "id" | "label" | "name" | "slug" | "type" | "placeholder" | "options" | "defaultAnswer" | "isRequired" | "order" | "placement"
> & { validation: CfValidation | null };

export function customFieldSlug(model: string, name: string): string {
  return `CUSTOM_${model}_${name}`.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export async function getCustomFields(companyId: number, modelType: CfModel): Promise<CustomFieldDef[]> {
  const rows = await db.customField.findMany({ where: { companyId, modelType }, orderBy: [{ order: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ ...r, validation: (r.validation as CfValidation | null) ?? null }));
}

function checkValue(f: CustomFieldDef, raw: string, today: string): string | null {
  const v = f.validation ?? {};
  switch (f.type as CfType) {
    case "Number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return "Enter a number.";
      if (v.min != null && n < v.min) return `Must be at least ${v.min}.`;
      if (v.max != null && n > v.max) return `Must be at most ${v.max}.`;
      return null;
    }
    case "Phone":
      return /^[+\d][\d\s().-]{3,}$/.test(raw) ? null : "Enter a valid phone number.";
    case "Url":
      try {
        const u = new URL(raw);
        return u.protocol === "http:" || u.protocol === "https:" ? null : "Enter an http(s) URL.";
      } catch {
        return "Enter a valid URL.";
      }
    case "Dropdown":
      return f.options.includes(raw) ? null : "Choose one of the options.";
    case "Switch":
      return null;
    case "Date":
    case "DateTime":
    case "Time": {
      const pattern = f.type === "Date" ? /^\d{4}-\d{2}-\d{2}$/ : f.type === "Time" ? /^\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
      if (!pattern.test(raw)) return "Enter a valid value.";
      const bound = (b: string | null | undefined) => (b === "today" ? today : b ?? null);
      const earliest = bound(v.earliest);
      const latest = bound(v.latest);
      if (earliest && raw < earliest) return `Must be on or after ${earliest}.`;
      if (latest && raw > latest) return `Must be on or before ${latest}.`;
      return null;
    }
    default: {
      if (v.min_length != null && raw.length < v.min_length) return `Use at least ${v.min_length} characters.`;
      if (v.max_length != null && raw.length > v.max_length) return `Use at most ${v.max_length} characters.`;
      if (v.pattern) {
        try {
          if (!new RegExp(v.pattern).test(raw)) return "The value does not match the required format.";
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

/** Reads `cf_<id>` inputs, enforces required + validation rules server-side. */
export async function validateCustomFieldAnswers(
  companyId: number,
  modelType: CfModel,
  formData: FormData,
  today = new Date().toISOString().slice(0, 10),
): Promise<{ ok: true; values: Map<number, string | null> } | { ok: false; errors: FieldErrors }> {
  const fields = await getCustomFields(companyId, modelType);
  const values = new Map<number, string | null>();
  const errors: FieldErrors = {};
  for (const f of fields) {
    const key = `cf_${f.id}`;
    let raw = formData.get(key);
    if (f.type === "Switch") raw = raw === "on" || raw === "true" ? "true" : "false";
    const str = typeof raw === "string" ? raw.trim() : "";
    if (!str) {
      if (f.isRequired) errors[key] = [`${f.label} is required.`];
      values.set(f.id, null);
      continue;
    }
    const err = checkValue(f, str, today);
    if (err) errors[key] = [err];
    values.set(f.id, str);
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

export async function saveCustomFieldAnswers(
  tx: Prisma.TransactionClient,
  companyId: number,
  modelType: CfModel,
  modelId: number,
  values: Map<number, string | null>,
) {
  for (const [customFieldId, value] of values) {
    await tx.customFieldValue.upsert({
      where: { customFieldId_modelType_modelId: { customFieldId, modelType, modelId } },
      create: { companyId, customFieldId, modelType, modelId, value },
      update: { value },
    });
  }
}

export async function copyCustomFieldAnswers(
  tx: Prisma.TransactionClient,
  from: { modelType: CfModel; modelId: number },
  to: { modelType: CfModel; modelId: number },
) {
  const rows = await tx.customFieldValue.findMany({ where: { modelType: from.modelType, modelId: from.modelId } });
  for (const r of rows) {
    await tx.customFieldValue.upsert({
      where: { customFieldId_modelType_modelId: { customFieldId: r.customFieldId, modelType: to.modelType, modelId: to.modelId } },
      create: { companyId: r.companyId, customFieldId: r.customFieldId, modelType: to.modelType, modelId: to.modelId, value: r.value },
      update: { value: r.value },
    });
  }
}

export async function loadCustomFieldAnswers(modelType: CfModel, modelId: number): Promise<Record<number, string | null>> {
  const rows = await db.customFieldValue.findMany({ where: { modelType, modelId } });
  return Object.fromEntries(rows.map((r) => [r.customFieldId, r.value]));
}

export function displayAnswer(f: Pick<CustomFieldDef, "type">, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (f.type === "Switch") return value === "true" ? "Yes" : "No";
  if (f.type === "DateTime") return value.replace("T", " ");
  return value;
}

/** Placeholder map {CUSTOM_...} -> display value for a record. */
export async function customFieldPlaceholders(companyId: number, modelType: CfModel, modelId: number) {
  const fields = await getCustomFields(companyId, modelType);
  const answers = await loadCustomFieldAnswers(modelType, modelId);
  return Object.fromEntries(fields.map((f) => [f.slug, displayAnswer(f, answers[f.id])]));
}
