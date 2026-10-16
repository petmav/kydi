"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { failure, guard, parseForm, success, type ActionState } from "@/lib/action";
import { getCompanyContext, requireAbility } from "@/lib/auth/context";
import { isCurrency } from "@/lib/intl-data";
import { formatDateTime, parseIsoDate, zonedToUtc } from "@/lib/dates";
import { isValidCron, upcomingOccurrences } from "@/domain/cron";
import { lastExchangeRate } from "@/server/documents";
import { nextNumber, type NumberKind } from "@/server/numbers";

export async function suggestNumberAction(kind: NumberKind, customerId: number): Promise<string> {
  const ctx = await getCompanyContext();
  const c = await db.customer.findFirst({ where: { id: customerId, companyId: ctx.companyId }, select: { id: true } });
  return (await nextNumber(ctx.companyId, kind, c?.id ?? null)).number;
}

export async function lookupRateAction(currency: string): Promise<number | null> {
  const ctx = await getCompanyContext();
  return lastExchangeRate(ctx.companyId, currency);
}

const quickCustomer = z.object({
  name: z.string().trim().min(3, "Use at least 3 characters.").max(255),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email address.")
    .optional(),
  currency: z.string().trim().toUpperCase().refine(isCurrency, "Enter a valid ISO currency code."),
});

export async function quickCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility("create-customer");
    const parsed = parseForm(quickCustomer, formData);
    if (!parsed.success) return parsed.state;
    const email = parsed.data.email || null;
    if (email && (await db.customer.findFirst({ where: { companyId: ctx.companyId, email } }))) {
      return failure("Another customer already uses this email.", { email: ["Already used by another customer."] });
    }
    const c = await db.customer.create({ data: { companyId: ctx.companyId, creatorId: ctx.user.id, name: parsed.data.name, email, currency: parsed.data.currency } });
    return success("Customer created.", { customer: { id: c.id, name: c.name, currency: c.currency, email: c.email } });
  });
}

export async function previewScheduleAction(frequency: string, startsAt: string): Promise<{ dates: string[]; error?: string }> {
  const ctx = await getCompanyContext();
  if (!isValidCron(frequency)) return { dates: [], error: "Enter a valid 5-field cron expression." };
  const d = parseIsoDate(startsAt);
  if (!d) return { dates: [], error: "Choose a start date." };
  const tz = ctx.settings.time_zone;
  const start = zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, tz);
  return { dates: upcomingOccurrences(frequency, start, tz, 5).map((x) => formatDateTime(x, tz, "EEE d MMM yyyy, HH:mm")) };
}
