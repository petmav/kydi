import { cleanRichText } from "@/lib/sanitize-html";
import { z } from "zod";
import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import type { FieldErrors } from "@/lib/action";
import { randomToken } from "@/lib/auth/tokens";
import { addDaysIso, isoDate, parseIsoDate, todayIn, zonedParts, zonedToUtc } from "@/lib/dates";
import { getCompanySettings } from "@/lib/settings";
import { copyCustomFieldAnswers, getCustomFields, saveCustomFieldAnswers, validateCustomFieldAnswers, type CfModel } from "@/lib/custom-fields";
import { sendPlatformMail } from "@/server/mailer";
import { getBaseUrl } from "@/lib/url";
import { isValidCron, nextOccurrence } from "@/domain/cron";
import { estimateTransitions, shouldMarkOverdue } from "@/domain/status";
import { buildDocument, copyLines, totalsData, writeLines, type DocumentInput } from "./documents";
import { nextNumber } from "./numbers";
import { recalcInvoice, type Result } from "./invoices";
import { emailDefaults, sendDocumentEmail } from "./email";

const REC_MODEL = "RecurringInvoice" as CfModel;

export const recurringFieldsSchema = z.object({
  startsAt: z.string(),
  frequency: z.string().trim(),
  limitBy: z.enum(["NONE", "COUNT", "DATE"]),
  limitCount: z.union([z.string(), z.number()]).optional(),
  limitDate: z.string().optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED"]),
  sendAutomatically: z.boolean(),
  notifyCreator: z.boolean(),
});
export type RecurringFields = z.infer<typeof recurringFieldsSchema>;

export const LAST_ERROR_TEXT: Record<string, string> = {
  recurring_invoice_customer_missing: "The customer no longer exists.",
  recurring_invoice_currency_changed: "The customer's currency changed since the schedule was created.",
  recurring_invoice_custom_field_required: "A required invoice custom field has no answer.",
  recurring_invoice_template_invalid: "The invoice template is invalid.",
  recurring_invoice_send_failed: "The invoice was created but could not be emailed; it was kept as a draft.",
  recurring_invoice_failed: "The invoice could not be created.",
};

const startOfDay = (iso: string, tz: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return zonedToUtc(y, m, d, 0, 0, tz);
};
const localDate = (instant: Date, tz: string) => {
  const p = zonedParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

function limitReached(s: { limitBy: string; limitCount: number | null; limitDate: Date | null }, runCount: number, runDate: string | null) {
  if (s.limitBy === "COUNT" && s.limitCount !== null) return runCount >= s.limitCount;
  if (s.limitBy === "DATE" && s.limitDate && runDate) return runDate > isoDate(s.limitDate);
  return false;
}

export async function saveRecurring(ctx: CompanyContext, id: number | null, input: DocumentInput, rec: RecurringFields, cfSource: FormData | Record<string, unknown>): Promise<Result> {
  const existing = id ? await db.recurringInvoice.findFirst({ where: { id, companyId: ctx.companyId } }) : null;
  if (id && !existing) return { ok: false, error: "Recurring invoice not found.", status: 404 };
  const tz = ctx.settings.time_zone;
  const errors: FieldErrors = {};
  const start = parseIsoDate(rec.startsAt);
  if (!start) errors.startsAt = ["Enter a start date."];
  if (!isValidCron(rec.frequency)) errors.frequency = ["Enter a valid 5-field cron expression."];
  const limitCount = rec.limitBy === "COUNT" ? Number(rec.limitCount) : null;
  if (rec.limitBy === "COUNT" && (!Number.isInteger(limitCount) || limitCount! < 1 || limitCount! > 10000)) errors.limitCount = ["Enter a whole number between 1 and 10000."];
  const limitDate = rec.limitBy === "DATE" ? parseIsoDate(rec.limitDate ?? "") : null;
  if (rec.limitBy === "DATE" && (!limitDate || (start && limitDate < start))) errors.limitDate = ["Enter a date on or after the start date."];
  if (Object.keys(errors).length) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: errors };

  const modes = existing ? { taxPerItem: existing.taxPerItem, discountPerItem: existing.discountPerItem } : { taxPerItem: ctx.settings.tax_per_item === "YES", discountPerItem: ctx.settings.discount_per_item === "YES" };
  const built = await buildDocument(ctx, input, modes, { requireDate: false });
  if (!built.ok) return built;
  const doc = built.doc;
  const cf = await validateCustomFieldAnswers(ctx.companyId, "Invoice", cfSource, todayIn(tz));
  if (!cf.ok) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: cf.errors };

  const startsAt = startOfDay(rec.startsAt, tz);
  const now = new Date();
  let nextInvoiceAt = existing?.nextInvoiceAt ?? null;
  let status = rec.status;
  const scheduleChanged = !existing || existing.frequency !== rec.frequency || existing.startsAt.getTime() !== startsAt.getTime();
  if (scheduleChanged) nextInvoiceAt = nextOccurrence(rec.frequency, startsAt > now ? startsAt : now, tz);
  if (existing && existing.status !== "ACTIVE" && status === "ACTIVE") {
    const from = new Date(Math.max(startOfDay(todayIn(tz), tz).getTime() - 1, startsAt.getTime()));
    nextInvoiceAt = nextOccurrence(rec.frequency, from, tz);
  }
  const runs = existing ? await db.recurringRun.count({ where: { recurringInvoiceId: existing.id } }) : 0;
  const limits = { limitBy: rec.limitBy, limitCount, limitDate };
  if (status !== "ON_HOLD") {
    if (limitReached(limits, runs, null) || (nextInvoiceAt && limitReached(limits, runs, localDate(nextInvoiceAt, tz)))) status = "COMPLETED";
    else if (existing?.status === "COMPLETED") status = "ACTIVE"; // raising a limit re-activates
  }
  const template = input.templateName && /^invoice[123]$/.test(input.templateName) ? input.templateName : existing?.templateName ?? ctx.settings.default_invoice_template;
  const saved = await db.$transaction(async (tx) => {
    const data = {
      customerId: doc.customer.id,
      startsAt,
      frequency: rec.frequency,
      status,
      nextInvoiceAt,
      limitBy: rec.limitBy,
      limitCount,
      limitDate,
      sendAutomatically: rec.sendAutomatically,
      notifyCreator: rec.notifyCreator,
      lastError: null,
      lastAttemptAt: null,
      notes: cleanRichText(input.notes),
      templateName: template,
      ...totalsData(doc),
    };
    const r = existing ? await tx.recurringInvoice.update({ where: { id: existing.id }, data }) : await tx.recurringInvoice.create({ data: { ...data, companyId: ctx.companyId, creatorId: ctx.user.id } });
    await writeLines(tx, ctx.companyId, { recurringInvoiceId: r.id }, doc);
    await saveCustomFieldAnswers(tx, ctx.companyId, REC_MODEL, r.id, cf.values);
    return r;
  });
  return { ok: true, id: saved.id };
}

export async function pauseResume(ctx: CompanyContext, id: number, action: "pause" | "resume"): Promise<Result> {
  const r = await db.recurringInvoice.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!r) return { ok: false, error: "Recurring invoice not found.", status: 404 };
  if (action === "pause") {
    if (r.status !== "ACTIVE") return { ok: false, error: "Only active schedules can be paused." };
    await db.recurringInvoice.update({ where: { id }, data: { status: "ON_HOLD" } });
    return { ok: true, id };
  }
  if (r.status !== "ON_HOLD") return { ok: false, error: "Only paused schedules can be resumed." };
  const tz = ctx.settings.time_zone;
  let next = r.nextInvoiceAt;
  const todayStart = startOfDay(todayIn(tz), tz);
  if (!next || next < todayStart) next = nextOccurrence(r.frequency, new Date(Math.max(todayStart.getTime() - 1, r.startsAt.getTime())), tz);
  const runs = await db.recurringRun.count({ where: { recurringInvoiceId: id } });
  const done = limitReached(r, runs, next ? localDate(next, tz) : null);
  await db.recurringInvoice.update({ where: { id }, data: { status: done ? "COMPLETED" : "ACTIVE", nextInvoiceAt: next, lastError: null, lastAttemptAt: null } });
  return { ok: true, id };
}

export async function deleteRecurring(ctx: CompanyContext, ids: number[]) {
  const owned = (await db.recurringInvoice.findMany({ where: { id: { in: ids }, companyId: ctx.companyId }, select: { id: true } })).map((r) => r.id);
  await db.customFieldValue.deleteMany({ where: { modelType: REC_MODEL, modelId: { in: owned } } });
  return (await db.recurringInvoice.deleteMany({ where: { id: { in: owned } } })).count;
}

async function notifyCreator(creatorId: number | null, subject: string, html: string) {
  if (!creatorId) return;
  const u = await db.user.findUnique({ where: { id: creatorId } });
  if (u) await sendPlatformMail({ to: u.email, subject, html }).catch((e) => console.error("[kydi] creator notification failed", e));
}

/** Generates invoices for due schedules (spec §4.9). Safe to call repeatedly (idempotent per moment). */
export async function runDueSchedules(now = new Date()): Promise<number> {
  const due = await db.recurringInvoice.findMany({
    where: { status: "ACTIVE", nextInvoiceAt: { lte: now }, OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: new Date(now.getTime() - 3600_000) } }] },
    select: { id: true },
    take: 200,
  });
  let generated = 0;
  for (const { id } of due) {
    try {
      if (await runOne(id, now)) generated++;
    } catch (e) {
      console.error(`[kydi] recurring run ${id} failed`, e);
      await db.recurringInvoice.update({ where: { id }, data: { lastError: "recurring_invoice_failed", lastAttemptAt: now } }).catch(() => undefined);
    }
  }
  return generated;
}

async function runOne(id: number, now: Date): Promise<boolean> {
  type Outcome = { invoiceId: number; creatorId: number | null; send: boolean; notify: boolean; customer: string; companyId: number } | { error: string; creatorId: number | null; notify: boolean; customer: string; isNew: boolean; scheduleId: number } | null;
  const outcome: Outcome = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "RecurringInvoice" WHERE id = ${id} FOR UPDATE`;
    const s = await tx.recurringInvoice.findUnique({ where: { id }, include: { customer: true } });
    if (!s || s.status !== "ACTIVE" || !s.nextInvoiceAt || s.nextInvoiceAt > now) return null;
    const settings = await getCompanySettings(s.companyId);
    const tz = settings.time_zone;
    // No catch-up: generate one invoice for the latest missed occurrence.
    let occ = s.nextInvoiceAt;
    for (let i = 0; i < 100000; i++) {
      const n = nextOccurrence(s.frequency, occ, tz);
      if (!n || n > now) break;
      occ = n;
    }
    const runDate = localDate(occ, tz);
    const runs = await tx.recurringRun.count({ where: { recurringInvoiceId: id } });
    if (limitReached(s, runs, runDate)) {
      await tx.recurringInvoice.update({ where: { id }, data: { status: "COMPLETED" } });
      return null;
    }
    const next = nextOccurrence(s.frequency, occ > now ? occ : now, tz);
    if (await tx.recurringRun.findUnique({ where: { recurringInvoiceId_scheduledAt: { recurringInvoiceId: id, scheduledAt: occ } } })) {
      await tx.recurringInvoice.update({ where: { id }, data: { nextInvoiceAt: next } });
      return null;
    }
    let error: string | null = null;
    if (!s.customer) error = "recurring_invoice_customer_missing";
    else if (s.customer.currency !== s.currency) error = "recurring_invoice_currency_changed";
    else {
      const required = (await getCustomFields(s.companyId, "Invoice")).filter((f) => f.isRequired);
      if (required.length) {
        const answers = await tx.customFieldValue.findMany({ where: { modelType: REC_MODEL, modelId: id } });
        if (required.some((f) => !answers.find((a) => a.customFieldId === f.id && a.value))) error = "recurring_invoice_custom_field_required";
      }
    }
    if (error) {
      const isNew = s.lastError !== error;
      await tx.recurringInvoice.update({ where: { id }, data: { lastError: error, lastAttemptAt: now } });
      return { error, creatorId: s.creatorId, notify: s.notifyCreator, customer: s.customer?.name ?? "", isNew, scheduleId: id };
    }
    const n = await nextNumber(s.companyId, "invoice", s.customerId, tx);
    const due = addDaysIso(runDate, Number(settings.invoice_due_date_days) || 7);
    const inv = await tx.invoice.create({
      data: {
        companyId: s.companyId,
        creatorId: s.creatorId,
        customerId: s.customerId,
        invoiceNumber: n.number,
        sequenceNumber: n.sequence,
        customerSequenceNumber: n.customerSequence,
        invoiceDate: parseIsoDate(runDate)!,
        dueDate: parseIsoDate(due),
        currency: s.currency,
        exchangeRate: s.exchangeRate,
        taxPerItem: s.taxPerItem,
        discountPerItem: s.discountPerItem,
        taxIncluded: s.taxIncluded,
        discountType: s.discountType,
        discount: s.discount,
        discountVal: s.discountVal,
        subTotal: s.subTotal,
        tax: s.tax,
        total: s.total,
        dueAmount: s.total,
        baseSubTotal: Math.round(Number(s.subTotal) * s.exchangeRate),
        baseDiscountVal: Math.round(Number(s.discountVal) * s.exchangeRate),
        baseTax: Math.round(Number(s.tax) * s.exchangeRate),
        baseTotal: Math.round(Number(s.total) * s.exchangeRate),
        baseDueAmount: Math.round(Number(s.total) * s.exchangeRate),
        notes: s.notes,
        templateName: s.templateName,
        recurringInvoiceId: id,
        uniqueHash: randomToken(24),
      },
    });
    await copyLines(tx, s.companyId, { recurringInvoiceId: id }, { invoiceId: inv.id });
    await copyCustomFieldAnswers(tx, { modelType: REC_MODEL, modelId: id }, { modelType: "Invoice", modelId: inv.id });
    await recalcInvoice(tx, inv.id);
    await tx.recurringRun.create({ data: { recurringInvoiceId: id, scheduledFor: parseIsoDate(runDate)!, scheduledAt: occ, invoiceId: inv.id } });
    const completed = limitReached(s, runs + 1, null) || (next ? limitReached(s, runs + 1, localDate(next, tz)) : true);
    await tx.recurringInvoice.update({ where: { id }, data: { nextInvoiceAt: next, lastError: null, lastAttemptAt: null, status: completed ? "COMPLETED" : "ACTIVE" } });
    return { invoiceId: inv.id, creatorId: s.creatorId, send: s.sendAutomatically, notify: s.notifyCreator, customer: s.customer.name, companyId: s.companyId };
  }, { timeout: 30000 });

  if (!outcome) return false;
  const base = await getBaseUrl();
  if ("error" in outcome) {
    if (outcome.notify && outcome.isNew) {
      await notifyCreator(outcome.creatorId, `Recurring invoice for ${outcome.customer} failed`, `<p>The recurring invoice for <strong>${outcome.customer}</strong> could not create an invoice.</p><p>Reason: ${LAST_ERROR_TEXT[outcome.error] ?? outcome.error}</p><p>Kydi retries hourly and emails you again only if the reason changes.</p><p><a href="${base}/recurring-invoices/${outcome.scheduleId}">Open the schedule</a></p>`);
    }
    return false;
  }
  if (outcome.send) {
    const d = await emailDefaults(outcome.companyId, "invoice", outcome.invoiceId);
    const res = d?.to ? await sendDocumentEmail(outcome.companyId, "invoice", outcome.invoiceId, d) : { ok: false as const, error: "no recipient" };
    if (!res.ok) await db.recurringInvoice.update({ where: { id }, data: { lastError: "recurring_invoice_send_failed" } });
  }
  if (outcome.notify) {
    const inv = await db.invoice.findUnique({ where: { id: outcome.invoiceId } });
    await notifyCreator(outcome.creatorId, `Invoice ${inv?.invoiceNumber} generated for ${outcome.customer}`, `<p>Recurring invoice <strong>${inv?.invoiceNumber}</strong> was generated for ${outcome.customer}.</p><p><a href="${base}/invoices/${outcome.invoiceId}">View invoice</a></p>`);
  }
  return true;
}

/** Daily sweeps (spec §4.5 / §4.7), run at most hourly; idempotent. */
export async function runSweeps(now = new Date()): Promise<{ overdue: number; expired: number }> {
  const state = await db.jobState.findUnique({ where: { key: "sweeps" } });
  if (state && now.getTime() - state.lastRunAt.getTime() < 3600_000) return { overdue: 0, expired: 0 };
  await db.jobState.upsert({ where: { key: "sweeps" }, create: { key: "sweeps", lastRunAt: now }, update: { lastRunAt: now } });
  let overdue = 0;
  let expired = 0;
  for (const c of await db.company.findMany({ select: { id: true } })) {
    const today = todayIn((await getCompanySettings(c.id)).time_zone, now);
    const todayD = parseIsoDate(today)!;
    const invs = await db.invoice.findMany({ where: { companyId: c.id, type: "INVOICE", overdue: false, status: { in: ["SENT", "VIEWED"] }, dueDate: { lt: todayD } }, select: { id: true, type: true, status: true, overdue: true, dueDate: true } });
    const ids = invs.filter((i) => shouldMarkOverdue({ ...i, dueDate: i.dueDate ? isoDate(i.dueDate) : null }, today)).map((i) => i.id);
    if (ids.length) overdue += (await db.invoice.updateMany({ where: { id: { in: ids }, dueAmount: { gt: 0 } }, data: { overdue: true } })).count;
    const ests = await db.estimate.findMany({ where: { companyId: c.id, status: { notIn: ["ACCEPTED", "REJECTED", "EXPIRED"] }, expiryDate: { lt: todayD } }, select: { id: true, status: true, expiryDate: true } });
    const eids = ests.filter((e) => estimateTransitions.shouldExpire(e.status, e.expiryDate ? isoDate(e.expiryDate) : null, today)).map((e) => e.id);
    if (eids.length) expired += (await db.estimate.updateMany({ where: { id: { in: eids } }, data: { status: "EXPIRED" } })).count;
  }
  return { overdue, expired };
}

let running = false;
/** Entry point for the cron route, boot catch-up and the in-process minute timer. */
export async function runScheduler(now = new Date()) {
  if (running) return { skipped: true };
  running = true;
  try {
    // Cross-process guard: with several replicas (or a cron call during a timer tick) only one runs the jobs.
    const { LOCKS, withAdvisoryLock } = await import("./locks");
    const r = await withAdvisoryLock(LOCKS.scheduler, async () => {
      const generated = await runDueSchedules(now);
      const { runDueRecurringCosts } = await import("./purchasing");
      const costs = await runDueRecurringCosts(now);
      const sweeps = await runSweeps(now);
      const { purgeExpiredAuthRecords } = await import("./retention");
      const purged = await purgeExpiredAuthRecords(now);
      return { skipped: false, generated, costs, ...sweeps, purged };
    });
    return r.acquired ? r.result : { skipped: true, reason: "another process holds the scheduler lock" };
  } finally {
    running = false;
  }
}
