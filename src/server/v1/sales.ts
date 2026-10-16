import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseIsoDate, todayIn, zonedToUtc } from "@/lib/dates";
import { frequencyLabel, isValidCron, upcomingOccurrences } from "@/domain/cron";
import { ApiError, cfFromBody, envelope, idList, listParams, need, ok, parseBody, unwrap, type V1Router } from "@/server/api";
import { docInput, parseDoc } from "@/server/v1/doc-input";
import { replacePaymentAllocations, applyCredit } from "@/server/payments";
import { convertInvoiceToEstimate, createCreditNote, INVOICE_TEMPLATES } from "@/server/invoices";
import { ESTIMATE_TEMPLATES } from "@/server/estimates";
import { deleteRecurring, pauseResume, recurringFieldsSchema, saveRecurring } from "@/server/recurring";
import { emailDefaults, renderDocumentEmail, type DocKind } from "@/server/email";
import { activityStatement, outstandingStatement } from "@/server/statement";
import { sendStatementEmail, statementMailSchema } from "@/server/statement-mail";
import { cashFlow, resolvePeriod } from "@/server/dashboard";
import { customerBalances } from "@/server/customers";

/**
 * /api/v1 sales endpoints that the core route does not cover (spec §9.2): payment allocation replacement,
 * recurring invoice CRUD and actions, customer stats / statements / credit allocations, send previews,
 * invoice conversions and credit notes.
 */

const words = (terms: string[], fields: string[]) => terms.map((t) => ({ OR: fields.map((f) => ({ [f]: { contains: t, mode: "insensitive" } })) }));

function recurringInput(body: Record<string, unknown>) {
  const doc = parseDoc(docInput(body, "__none", "__none", "__none"));
  const rec = parseBody(recurringFieldsSchema, {
    startsAt: String(body.starts_at ?? "").slice(0, 10),
    frequency: String(body.frequency ?? ""),
    limitBy: String(body.limit_by ?? "NONE").toUpperCase(),
    limitCount: body.limit_count ?? undefined,
    limitDate: body.limit_date ? String(body.limit_date).slice(0, 10) : undefined,
    status: String(body.status ?? "ACTIVE").toUpperCase(),
    sendAutomatically: !!body.send_automatically,
    notifyCreator: !!body.notify_creator,
  });
  return { doc, rec };
}

const recurringInclude = {
  customer: { select: { id: true, name: true, email: true, currency: true } },
  lines: { include: { taxes: true }, orderBy: { position: "asc" } },
  taxes: { where: { lineItemId: null } },
  invoices: { select: { id: true, invoiceNumber: true, invoiceDate: true, status: true, total: true }, orderBy: { invoiceDate: "desc" } },
} satisfies Prisma.RecurringInvoiceInclude;

export const salesRouter: V1Router = async ({ ctx, url, seg, method, body }) => {
  const [resource, second, third, fourth] = seg;
  const id = Number(second);
  const hasId = Number.isInteger(id) && id > 0;

  // ---- payments ---------------------------------------------------------------------------------
  if (resource === "payments" && hasId && third === "allocations" && method === "PUT") {
    need(ctx, "edit-payment");
    const rows = Array.isArray(body.allocations) ? (body.allocations as Record<string, unknown>[]) : null;
    if (!rows) throw new ApiError(422, "payment_allocation_required", { allocations: ["payment_allocation_required"] });
    const parsed = rows.map((r) => ({ invoiceId: Number(r.invoice_id), amount: Number(r.amount) }));
    if (parsed.some((r) => !Number.isInteger(r.invoiceId) || r.invoiceId <= 0 || !Number.isInteger(r.amount))) throw new ApiError(422, "payment_allocation_invalid", { allocations: ["payment_allocation_invalid"] });
    unwrap(await replacePaymentAllocations(ctx, id, parsed.filter((r) => r.amount > 0)));
    const p = await db.payment.findUniqueOrThrow({ where: { id }, include: { allocations: { include: { invoice: { select: { id: true, invoiceNumber: true } } } } } });
    const allocated = p.allocations.reduce((s, a) => s + Number(a.amount), 0);
    return ok({ data: { ...p, allocated_amount: allocated, unallocated_amount: Number(p.amount) - allocated } });
  }

  // ---- send previews ----------------------------------------------------------------------------
  if (["invoices", "estimates", "payments"].includes(resource) && hasId && third === "send" && fourth === "preview" && method === "GET") {
    const kind = resource.slice(0, -1) as DocKind;
    need(ctx, `send-${kind}` as "send-invoice");
    const d = await emailDefaults(ctx.companyId, kind, id);
    if (!d) throw new ApiError(404, "Not found.");
    const fields = { to: url.searchParams.get("to") ?? d.to, subject: url.searchParams.get("subject") ?? d.subject, body: url.searchParams.get("body") ?? d.body };
    const r = await renderDocumentEmail(ctx.companyId, kind, id, fields);
    return ok({ data: { from: d.from, to: fields.to, subject: r!.subject, html: r!.html } });
  }

  // ---- templates, conversions, credit notes -----------------------------------------------------
  if (resource === "invoices" && second === "templates" && method === "GET") return ok({ data: INVOICE_TEMPLATES.map((name) => ({ name })) });
  if (resource === "estimates" && second === "templates" && method === "GET") return ok({ data: ESTIMATE_TEMPLATES.map((name) => ({ name })) });
  if (resource === "invoices" && hasId && third === "convert-to-estimate" && method === "POST") {
    need(ctx, "view-invoice", "create-estimate");
    return ok({ data: { id: unwrap(await convertInvoiceToEstimate(ctx, id)) } }, 201);
  }
  if (resource === "invoices" && hasId && third === "credit-note" && method === "POST") {
    need(ctx, "create-invoice");
    const reason = body.reason ? String(body.reason).slice(0, 1000) : null;
    const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
    const request = new Map(items.map((i) => [Number(i.id ?? i.line_id), Number(i.quantity)] as [number, number]).filter(([lid, q]) => Number.isInteger(lid) && q > 0));
    return ok({ data: { id: unwrap(await createCreditNote(ctx, id, reason, request)) } }, 201);
  }

  // ---- recurring invoices -----------------------------------------------------------------------
  if (resource === "recurring-invoice-frequency" && method === "GET") {
    need(ctx, "view-recurring-invoice");
    const frequency = url.searchParams.get("frequency") ?? "";
    if (!isValidCron(frequency)) throw new ApiError(422, "Enter a valid 5-field cron expression.", { frequency: ["invalid_cron"] });
    const tz = ctx.settings.time_zone;
    const d = parseIsoDate((url.searchParams.get("starts_at") ?? todayIn(tz)).slice(0, 10));
    if (!d) throw new ApiError(422, "Enter a valid start date.", { starts_at: ["invalid_date"] });
    const start = zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, tz);
    const dates = upcomingOccurrences(frequency, start, tz, 5);
    return ok({ next_invoice_at: dates[0] ?? null, upcoming: dates, label: frequencyLabel(frequency) });
  }
  if (resource === "recurring-invoices") {
    if (!second && method === "GET") {
      need(ctx, "view-recurring-invoice");
      const p = listParams(url, ["startsAt", "nextInvoiceAt", "total", "createdAt"], "createdAt");
      const where: Prisma.RecurringInvoiceWhereInput = { companyId: ctx.companyId, AND: p.terms.length ? [{ customer: { AND: words(p.terms, ["name", "contactName", "companyName"]) } }] : [] };
      const st = p.q("status").toUpperCase();
      if (["ACTIVE", "ON_HOLD", "COMPLETED"].includes(st)) where.status = st as "ACTIVE";
      if (p.q("customer_id")) where.customerId = Number(p.q("customer_id"));
      const f = parseIsoDate(p.q("from_date"));
      const t = parseIsoDate(p.q("to_date"));
      if (f && t) where.startsAt = { gte: f, lte: new Date(t.getTime() + 86400000 - 1) };
      const [rows, total, unfiltered] = await Promise.all([
        db.recurringInvoice.findMany({ where, include: { customer: { select: { id: true, name: true } } }, orderBy: p.orderBy, skip: p.skip, take: p.limit }),
        db.recurringInvoice.count({ where }),
        db.recurringInvoice.count({ where: { companyId: ctx.companyId } }),
      ]);
      return ok(envelope(rows.map((r) => ({ ...r, frequency_label: frequencyLabel(r.frequency) })), total, unfiltered, "recurring_invoice", p));
    }
    if (!second && method === "POST") {
      need(ctx, "create-recurring-invoice");
      const { doc, rec } = recurringInput(body);
      const newId = unwrap(await saveRecurring(ctx, null, doc, rec, cfFromBody(body)));
      return ok({ data: await db.recurringInvoice.findUnique({ where: { id: newId }, include: recurringInclude }) }, 201);
    }
    if (second === "delete" && method === "POST") {
      need(ctx, "delete-recurring-invoice");
      return ok({ success: true, deleted: await deleteRecurring(ctx, idList(body)) });
    }
    if (!hasId) return null;
    if (!third && method === "GET") {
      need(ctx, "view-recurring-invoice");
      const r = await db.recurringInvoice.findFirst({ where: { id, companyId: ctx.companyId }, include: recurringInclude });
      if (!r) throw new ApiError(404, "Not found.");
      return ok({ data: { ...r, items: r.lines, frequency_label: frequencyLabel(r.frequency) } });
    }
    if (!third && (method === "PUT" || method === "PATCH")) {
      need(ctx, "edit-recurring-invoice");
      const { doc, rec } = recurringInput(body);
      unwrap(await saveRecurring(ctx, id, doc, rec, cfFromBody(body)));
      return ok({ data: await db.recurringInvoice.findUnique({ where: { id }, include: recurringInclude }) });
    }
    if (!third && method === "DELETE") {
      need(ctx, "delete-recurring-invoice");
      return ok({ success: true, deleted: await deleteRecurring(ctx, [id]) });
    }
    if (third === "actions" && method === "POST") {
      need(ctx, "edit-recurring-invoice");
      const action = String(body.action ?? "");
      if (action !== "pause" && action !== "resume") throw new ApiError(422, "Unsupported action.", { action: ["pause_or_resume"] });
      const r = await pauseResume(ctx, id, action);
      if (!r.ok) throw new ApiError(r.status ?? 422, action === "pause" ? "recurring_invoice_not_active" : "recurring_invoice_not_paused", { status: [r.error] });
      return ok({ success: true });
    }
    return null;
  }

  // ---- customers: stats, statement, credit --------------------------------------------------------
  if (resource === "customers" && hasId && third) {
    const customer = await db.customer.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!customer) throw new ApiError(404, "Not found.");
    if (third === "stats" && method === "GET") {
      need(ctx, "view-customer");
      const sp = url.searchParams;
      const period = resolvePeriod(ctx.settings, sp.get("previous_year") ? "previous" : sp.get("from_date") ? "custom" : sp.get("period") ?? "this", sp.get("from_date") ?? undefined, sp.get("to_date") ?? undefined);
      const bal = (await customerBalances(ctx.companyId, [id])).get(id)!;
      return ok({ data: { period, chart: await cashFlow(ctx.companyId, period, id), invoice_due_amount: bal.due, available_credit: bal.credit, account_balance: bal.due - bal.credit } });
    }
    if (third === "statement" && !fourth && method === "GET") {
      need(ctx, "view-customer", "view-financial-reports");
      const sp = url.searchParams;
      const today = todayIn(ctx.settings.time_zone);
      if ((sp.get("type") ?? "activity") === "outstanding") {
        const asOf = sp.get("as_of") ?? sp.get("to_date") ?? today;
        if (!parseIsoDate(asOf)) throw new ApiError(422, "Enter a valid as-of date.", { as_of: ["invalid_date"] });
        return ok({ data: { type: "outstanding", as_of: asOf, currency: customer.currency, ...(await outstandingStatement(ctx.companyId, id, asOf)) } });
      }
      const from = sp.get("from_date") ?? "";
      const to = sp.get("to_date") ?? "";
      if (!parseIsoDate(from) || !parseIsoDate(to) || from > to) throw new ApiError(422, "from_date and to_date are required (YYYY-MM-DD, from ≤ to).", { from_date: ["required"], to_date: ["required"] });
      const st = await activityStatement(ctx.companyId, id, from, to);
      const perPage = Math.min(100, Math.max(1, Number(sp.get("per_page")) || 100));
      const lastPage = Math.max(1, Math.ceil(st.entries.length / perPage));
      const page = Math.min(lastPage, Math.max(1, Number(sp.get("page")) || 1));
      return ok({
        data: { type: "activity", from_date: from, to_date: to, currency: customer.currency, opening: st.opening, closing: st.closing, entries: st.entries.slice((page - 1) * perPage, page * perPage) },
        meta: { current_page: page, last_page: lastPage, per_page: perPage, total: st.entries.length },
      });
    }
    if (third === "statement" && fourth === "send" && method === "POST") {
      need(ctx, "view-customer", "view-financial-reports");
      const input = parseBody(statementMailSchema, { type: body.type, from: body.from_date, to: body.to_date ?? body.as_of, email: body.to, cc: body.cc, bcc: body.bcc, subject: body.subject, body: body.body });
      const r = await sendStatementEmail(ctx.companyId, id, input);
      if (!r.ok) throw new ApiError(r.status ?? 422, r.error);
      return ok({ success: true });
    }
    if (third === "credit-allocations" && method === "POST") {
      need(ctx, "view-customer", "edit-payment");
      const rows = parseBody(z.array(z.object({ payment_id: z.coerce.number().int().positive(), invoice_id: z.coerce.number().int().positive(), amount: z.coerce.number().int().positive() })).min(1, "payment_allocation_required"), body.allocations);
      const r = await applyCredit(ctx, id, rows.map((x) => ({ paymentId: x.payment_id, invoiceId: x.invoice_id, amount: x.amount })));
      if (!r.ok) throw new ApiError(422, r.error, { allocations: [r.error] });
      const bal = (await customerBalances(ctx.companyId, [id])).get(id)!;
      return ok({ success: true, data: { invoice_due_amount: bal.due, available_credit: bal.credit } });
    }
    return null;
  }

  return null;
};
