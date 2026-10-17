import { env } from "@/lib/env";
import { z } from "zod";
import { db } from "@/lib/db";
import { countryName } from "@/lib/intl-data";
import { randomToken } from "@/lib/auth/tokens";
import { companyValues, customerValues, fillPlaceholders } from "@/lib/placeholders";
import { getBaseUrl } from "@/lib/url";
import { addDaysIso, parseIsoDate, todayIn } from "@/lib/dates";
import { getCompanySettings } from "@/lib/settings";
import { buildStatement } from "./reports";
import { renderSimplePdf } from "./pdf";
import { layout, sanitizeHtml } from "./email";
import { sendCompanyMail } from "./mailer";

/** Customer statement email (spec §5.2 "Send statement", §7.7): body from the dialog, statement PDF attached. */

export const statementMailSchema = z.object({
  type: z.enum(["activity", "outstanding"]).default("activity"),
  from: z.string().optional(),
  to: z.string().optional(),
  email: z.string().trim().email("Enter a valid email address."),
  cc: z.string().trim().max(1000).optional().nullable(),
  bcc: z.string().trim().max(1000).optional().nullable(),
  subject: z.string().trim().min(1, "Enter a subject.").max(255),
  body: z.string().trim().min(1, "Enter a message.").max(65000),
});
export type StatementMail = z.infer<typeof statementMailSchema>;

export async function statementDefaults(companyId: number, customerId: number) {
  const c = await db.customer.findFirst({ where: { id: customerId, companyId } });
  if (!c) return null;
  const company = (await db.company.findUnique({ where: { id: companyId } }))!;
  return {
    email: c.email ?? "",
    subject: `Account statement from ${company.name}`,
    body: `<p>Hello {CONTACT_DISPLAY_NAME},</p><p>Please find attached your account statement from <strong>{COMPANY_NAME}</strong>.</p>`,
  };
}

const splitList = (v?: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

export async function sendStatementEmail(companyId: number, customerId: number, input: StatementMail): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const c = await db.customer.findFirst({ where: { id: customerId, companyId } });
  if (!c) return { ok: false, error: "Customer not found.", status: 404 };
  const settings = await getCompanySettings(companyId);
  const today = todayIn(settings.time_zone);
  const to = input.to && parseIsoDate(input.to) ? input.to : today;
  const from = input.from && parseIsoDate(input.from) ? input.from : addDaysIso(to, -90);
  if (from > to) return { ok: false, error: "The start date must be on or before the end date." };
  const data = await buildStatement(companyId, customerId, input.type, from, to);
  if (!data) return { ok: false, error: "Customer not found.", status: 404 };
  const pdf = await renderSimplePdf(data);
  const company = (await db.company.findUnique({ where: { id: companyId } }))!;
  const values = { ...companyValues(company, countryName), ...customerValues(c, countryName) };
  const subject = fillPlaceholders(input.subject, values, false).replace(/[\r\n]+/g, " ").trim();
  const base = await getBaseUrl();
  const html = layout({ companyName: company.name, logoUrl: company.logoPath ? `${base}/api/files/logo/${company.uniqueHash}` : null, body: sanitizeHtml(fillPlaceholders(input.body, values)) });
  await db.emailLog.create({
    data: { companyId, from: env.smtp.from, to: input.email, cc: input.cc || null, bcc: input.bcc || null, subject, body: html, mailableType: "statement", mailableId: customerId, token: randomToken(32) },
  });
  try {
    await sendCompanyMail(companyId, {
      to: input.email,
      cc: splitList(input.cc),
      bcc: splitList(input.bcc),
      subject,
      html,
      attachments: [{ filename: `statement-${c.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-${to}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Email could not be sent: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}
