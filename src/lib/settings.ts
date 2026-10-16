import { cache } from "react";
import { db } from "@/lib/db";

/** Company preference keys with defaults. Stored as strings in CompanySetting. */
export const SETTING_DEFAULTS = {
  currency: "USD",
  locale: "en-US",
  timezone: "UTC",
  dateFormat: "yyyy-MM-dd",
  fiscalYearStartMonth: "1",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type CompanySettings = { [K in SettingKey]: string };

export const getCompanySettings = cache(async (companyId: string): Promise<CompanySettings> => {
  const rows = await db.companySetting.findMany({ where: { companyId } });
  const out: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out as CompanySettings;
});

export async function saveCompanySettings(companyId: string, values: Partial<Record<string, string>>) {
  const entries = Object.entries(values).filter((e): e is [string, string] => typeof e[1] === "string");
  await db.$transaction(
    entries.map(([key, value]) =>
      db.companySetting.upsert({
        where: { companyId_key: { companyId, key } },
        create: { companyId, key, value },
        update: { value },
      }),
    ),
  );
}
