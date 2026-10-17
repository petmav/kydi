import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyPasswordOrDummy } from "@/lib/auth/password";
import { clientIpFrom } from "@/lib/request-meta";
import { randomToken, sha256 } from "@/lib/auth/tokens";
import { clearCredentialFailures, throttleCredentials } from "@/lib/rate-limit";
import { parseIsoDate } from "@/lib/dates";
import { ApiError, apiContext, apiUser, cfFromBody, envelope, fail, listParams, need, ok, unwrap } from "@/server/api";
import { teamRouter } from "@/server/v1/team";
import { salesRouter } from "@/server/v1/sales";
import { pendingInvitationsFor, respondToInvitation } from "@/server/team";
import { customerSchema, deleteCustomers, saveCustomer, customerBalances } from "@/server/customers";
import { deleteItems, itemSchema, saveItem } from "@/server/items";
import { docInput, parseDoc } from "@/server/v1/doc-input";
import { cloneInvoice, deleteInvoices, markInvoiceCompleted, markInvoiceSent, saveInvoice } from "@/server/invoices";
import { cloneEstimate, convertEstimateToInvoice, deleteEstimates, saveEstimate, setEstimateStatus } from "@/server/estimates";
import { deletePayments, paymentSchema, savePayment } from "@/server/payments";
import { deleteExpenses, expenseSchema, saveExpense } from "@/server/expenses";
import { emailDefaults, sendDocumentEmail } from "@/server/email";
import { dashboardData, resolvePeriod } from "@/server/dashboard";
import { nextNumber, type NumberKind } from "@/server/numbers";
import type { CompanyContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

type Handler = (ctx: CompanyContext, req: Request, url: URL, id: number | null, body: Record<string, unknown>) => Promise<Response>;

const words = (terms: string[], fields: string[]) => terms.map((t) => ({ OR: fields.map((f) => ({ [f]: { contains: t, mode: "insensitive" } })) }));

function check<T>(r: { ok: true; id: T } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined>; status?: number }): T {
  if (!r.ok) throw new ApiError(r.status ?? 422, r.error, r.fieldErrors);
  return r.id;
}

const crud = {
  customers: {
    list: (async (ctx, _r, url) => {
      need(ctx, "view-customer");
      const p = listParams(url, ["name", "createdAt", "phone"], "name", "asc");
      const where: Prisma.CustomerWhereInput = { companyId: ctx.companyId, AND: words(p.terms, ["name", "email", "phone", "contactName"]) };
      if (p.q("display_name")) where.name = { contains: p.q("display_name"), mode: "insensitive" };
      const [rows, total, unfiltered] = await Promise.all([db.customer.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.limit, omit: { portalPasswordHash: true } }), db.customer.count({ where }), db.customer.count({ where: { companyId: ctx.companyId } })]);
      const bal = await customerBalances(ctx.companyId, rows.map((r) => r.id));
      return ok(envelope(rows.map((r) => ({ ...r, due_amount: bal.get(r.id)?.due ?? 0, available_credit: bal.get(r.id)?.credit ?? 0 })), total, unfiltered, "customer", p));
    }) as Handler,
    show: (async (ctx, _r, _u, id) => {
      need(ctx, "view-customer");
      const c = await db.customer.findFirst({ where: { id: id!, companyId: ctx.companyId }, omit: { portalPasswordHash: true } });
      if (!c) throw new ApiError(404, "Not found.");
      const b = (await customerBalances(ctx.companyId, [c.id])).get(c.id)!;
      return ok({ data: { ...c, password_added: !!(await db.customer.count({ where: { id: c.id, portalPasswordHash: { not: null } } })), invoice_due_amount: b.due, base_invoice_due_amount: b.baseDue, available_credit: b.credit, account_balance: b.due - b.credit } });
    }) as Handler,
    save: (async (ctx, _r, _u, id, body) => {
      need(ctx, id ? "edit-customer" : "create-customer");
      const parsed = customerSchema.safeParse(body);
      if (!parsed.success) throw new ApiError(422, "The given data was invalid.", parsed.error.flatten().fieldErrors);
      const newId = check(await saveCustomer(ctx, id, parsed.data, cfFromBody(body)));
      return ok({ data: await db.customer.findUnique({ where: { id: newId }, omit: { portalPasswordHash: true } }) }, id ? 200 : 201);
    }) as Handler,
    remove: (async (ctx, _r, _u, _id, body) => {
      need(ctx, "delete-customer");
      return ok({ success: true, deleted: await deleteCustomers(ctx, ((body.ids as number[]) ?? []).map(Number)) });
    }) as Handler,
  },
  items: {
    list: (async (ctx, _r, url) => {
      need(ctx, "view-item");
      const p = listParams(url, ["name", "price", "createdAt"], "name", "asc");
      const where: Prisma.ItemWhereInput = { companyId: ctx.companyId, AND: words(p.terms, ["name", "description"]) };
      if (p.q("unit_id")) where.unitId = Number(p.q("unit_id"));
      const [rows, total, unfiltered] = await Promise.all([db.item.findMany({ where, include: { unit: true, taxes: { include: { taxType: true } } }, orderBy: p.orderBy, skip: p.skip, take: p.limit }), db.item.count({ where }), db.item.count({ where: { companyId: ctx.companyId } })]);
      return ok(envelope(rows, total, unfiltered, "item", p));
    }) as Handler,
    show: (async (ctx, _r, _u, id) => {
      need(ctx, "view-item");
      const it = await db.item.findFirst({ where: { id: id!, companyId: ctx.companyId }, include: { unit: true, taxes: true } });
      if (!it) throw new ApiError(404, "Not found.");
      return ok({ data: it });
    }) as Handler,
    save: (async (ctx, _r, _u, id, body) => {
      need(ctx, id ? "edit-item" : "create-item");
      const parsed = itemSchema.safeParse({ ...body, unitId: body.unit_id, priceIsMinor: true, taxes: ((body.taxes as { tax_type_id: number }[]) ?? []).map((t) => t.tax_type_id) });
      if (!parsed.success) throw new ApiError(422, "The given data was invalid.", parsed.error.flatten().fieldErrors);
      const newId = check(await saveItem(ctx, id, parsed.data, cfFromBody(body)));
      return ok({ data: await db.item.findUnique({ where: { id: newId }, include: { unit: true, taxes: true } }) }, id ? 200 : 201);
    }) as Handler,
    remove: (async (ctx, _r, _u, _id, body) => {
      need(ctx, "delete-item");
      return ok({ success: true, deleted: await deleteItems(ctx, ((body.ids as number[]) ?? []).map(Number)) });
    }) as Handler,
  },
  invoices: {
    list: (async (ctx, _r, url) => {
      need(ctx, "view-invoice");
      const p = listParams(url, ["sequenceNumber", "invoiceDate", "invoiceNumber", "total", "dueAmount"], "sequenceNumber");
      const where: Prisma.InvoiceWhereInput = { companyId: ctx.companyId, AND: words(p.terms, ["invoiceNumber"]).length ? [{ OR: [{ invoiceNumber: { contains: p.terms.join(" "), mode: "insensitive" } }, { customer: { name: { contains: p.terms.join(" "), mode: "insensitive" } } }] }] : [] };
      const st = p.q("status");
      if (["DRAFT", "SENT", "VIEWED", "COMPLETED"].includes(st)) where.status = st as Prisma.InvoiceWhereInput["status"];
      if (["UNPAID", "PARTIALLY_PAID", "PAID"].includes(st) || p.q("paid_status")) where.paidStatus = (p.q("paid_status") || st) as Prisma.InvoiceWhereInput["paidStatus"];
      if (st === "DUE") where.paidStatus = { in: ["UNPAID", "PARTIALLY_PAID"] };
      if (p.q("customer_id")) where.customerId = Number(p.q("customer_id"));
      if (p.q("invoice_number")) where.invoiceNumber = { contains: p.q("invoice_number"), mode: "insensitive" };
      const f = parseIsoDate(p.q("from_date"));
      const t = parseIsoDate(p.q("to_date"));
      if (f && t) where.invoiceDate = { gte: f, lte: t };
      const [rows, total, unfiltered] = await Promise.all([db.invoice.findMany({ where, include: { customer: { select: { id: true, name: true } } }, orderBy: p.orderBy, skip: p.skip, take: p.limit }), db.invoice.count({ where }), db.invoice.count({ where: { companyId: ctx.companyId } })]);
      return ok(envelope(rows, total, unfiltered, "invoice", p));
    }) as Handler,
    show: (async (ctx, _r, _u, id) => {
      need(ctx, "view-invoice");
      const inv = await db.invoice.findFirst({ where: { id: id!, companyId: ctx.companyId }, include: { customer: { omit: { portalPasswordHash: true } }, lines: { include: { taxes: true }, orderBy: { position: "asc" } }, taxes: { where: { lineItemId: null } }, creditNotes: { select: { id: true, invoiceNumber: true, total: true } }, allocations: { include: { payment: { select: { id: true, paymentNumber: true, paymentDate: true } } } } } });
      if (!inv) throw new ApiError(404, "Not found.");
      return ok({ data: { ...inv, items: inv.lines } });
    }) as Handler,
    save: (async (ctx, _r, _u, id, body) => {
      need(ctx, id ? "edit-invoice" : "create-invoice");
      const newId = check(await saveInvoice(ctx, id, parseDoc(docInput(body, "invoice_date", "due_date", "invoice_number")), cfFromBody(body), !!body.invoiceSend && !id));
      return ok({ data: await db.invoice.findUnique({ where: { id: newId }, include: { lines: { include: { taxes: true } }, taxes: true } }) }, id ? 200 : 201);
    }) as Handler,
    remove: (async (ctx, _r, _u, _id, body) => {
      need(ctx, "delete-invoice");
      const r = await deleteInvoices(ctx, ((body.ids as number[]) ?? []).map(Number));
      if (r.blocked.length) throw new ApiError(422, "invoice_has_payment_allocations", { ids: r.blocked });
      return ok({ success: true, deleted: r.deleted });
    }) as Handler,
  },
  estimates: {
    list: (async (ctx, _r, url) => {
      need(ctx, "view-estimate");
      const p = listParams(url, ["sequenceNumber", "estimateDate", "estimateNumber", "total"], "sequenceNumber");
      const where: Prisma.EstimateWhereInput = { companyId: ctx.companyId, AND: words(p.terms, ["estimateNumber"]) };
      if (p.q("status")) where.status = p.q("status") as Prisma.EstimateWhereInput["status"];
      if (p.q("customer_id")) where.customerId = Number(p.q("customer_id"));
      const [rows, total, unfiltered] = await Promise.all([db.estimate.findMany({ where, include: { customer: { select: { id: true, name: true } } }, orderBy: p.orderBy, skip: p.skip, take: p.limit }), db.estimate.count({ where }), db.estimate.count({ where: { companyId: ctx.companyId } })]);
      return ok(envelope(rows, total, unfiltered, "estimate", p));
    }) as Handler,
    show: (async (ctx, _r, _u, id) => {
      need(ctx, "view-estimate");
      const e = await db.estimate.findFirst({ where: { id: id!, companyId: ctx.companyId }, include: { lines: { include: { taxes: true } }, taxes: { where: { lineItemId: null } } } });
      if (!e) throw new ApiError(404, "Not found.");
      return ok({ data: { ...e, items: e.lines } });
    }) as Handler,
    save: (async (ctx, _r, _u, id, body) => {
      need(ctx, id ? "edit-estimate" : "create-estimate");
      const newId = check(await saveEstimate(ctx, id, parseDoc(docInput(body, "estimate_date", "expiry_date", "estimate_number")), cfFromBody(body), !!body.estimateSend && !id));
      return ok({ data: await db.estimate.findUnique({ where: { id: newId }, include: { lines: true, taxes: true } }) }, id ? 200 : 201);
    }) as Handler,
    remove: (async (ctx, _r, _u, _id, body) => {
      need(ctx, "delete-estimate");
      return ok({ success: true, deleted: await deleteEstimates(ctx, ((body.ids as number[]) ?? []).map(Number)) });
    }) as Handler,
  },
  payments: {
    list: (async (ctx, _r, url) => {
      need(ctx, "view-payment");
      const p = listParams(url, ["sequenceNumber", "paymentDate", "paymentNumber", "amount"], "sequenceNumber");
      const where: Prisma.PaymentWhereInput = { companyId: ctx.companyId, AND: words(p.terms, ["paymentNumber"]) };
      if (p.q("customer_id")) where.customerId = Number(p.q("customer_id"));
      if (p.q("payment_method_id")) where.paymentMethodId = Number(p.q("payment_method_id"));
      const [rows, total, unfiltered] = await Promise.all([db.payment.findMany({ where, include: { allocations: true, paymentMethod: true }, orderBy: p.orderBy, skip: p.skip, take: p.limit }), db.payment.count({ where }), db.payment.count({ where: { companyId: ctx.companyId } })]);
      return ok(envelope(rows, total, unfiltered, "payment", p));
    }) as Handler,
    show: (async (ctx, _r, _u, id) => {
      need(ctx, "view-payment");
      const pm = await db.payment.findFirst({ where: { id: id!, companyId: ctx.companyId }, include: { allocations: { include: { invoice: { select: { id: true, invoiceNumber: true } } } }, paymentMethod: true } });
      if (!pm) throw new ApiError(404, "Not found.");
      const allocated = pm.allocations.reduce((s, a) => s + Number(a.amount), 0);
      return ok({ data: { ...pm, allocated_amount: allocated, unallocated_amount: Number(pm.amount) - allocated } });
    }) as Handler,
    save: (async (ctx, _r, _u, id, body) => {
      need(ctx, id ? "edit-payment" : "create-payment");
      const parsed = paymentSchema.safeParse({ customerId: body.customer_id, paymentDate: body.payment_date, paymentNumber: body.payment_number ?? "", amount: body.amount, exchangeRate: body.exchange_rate, paymentMethodId: body.payment_method_id ?? null, notes: body.notes ?? null, allocations: Array.isArray(body.allocations) ? (body.allocations as { invoice_id: number; amount: number }[]).map((a) => ({ invoiceId: a.invoice_id, amount: a.amount })) : undefined, minor: true });
      if (!parsed.success) throw new ApiError(422, "The given data was invalid.", parsed.error.flatten().fieldErrors);
      const newId = check(await savePayment(ctx, id, parsed.data, cfFromBody(body)));
      return ok({ data: await db.payment.findUnique({ where: { id: newId }, include: { allocations: true } }) }, id ? 200 : 201);
    }) as Handler,
    remove: (async (ctx, _r, _u, _id, body) => {
      need(ctx, "delete-payment");
      return ok({ success: true, deleted: await deletePayments(ctx, ((body.ids as number[]) ?? []).map(Number)) });
    }) as Handler,
  },
  expenses: {
    list: (async (ctx, _r, url) => {
      need(ctx, "view-expense");
      const p = listParams(url, ["expenseDate", "amount"], "expenseDate");
      const where: Prisma.ExpenseWhereInput = { companyId: ctx.companyId, AND: words(p.terms, ["notes"]) };
      if (p.q("expense_category_id")) where.categoryId = Number(p.q("expense_category_id"));
      if (p.q("customer_id")) where.customerId = Number(p.q("customer_id"));
      const [rows, total, unfiltered] = await Promise.all([db.expense.findMany({ where, include: { category: true, taxes: true }, orderBy: p.orderBy, skip: p.skip, take: p.limit }), db.expense.count({ where }), db.expense.count({ where: { companyId: ctx.companyId } })]);
      return ok(envelope(rows, total, unfiltered, "expense", p));
    }) as Handler,
    show: (async (ctx, _r, _u, id) => {
      need(ctx, "view-expense");
      const e = await db.expense.findFirst({ where: { id: id!, companyId: ctx.companyId }, include: { category: true, taxes: true } });
      if (!e) throw new ApiError(404, "Not found.");
      return ok({ data: { ...e, receipt: e.receiptPath ? { name: e.receiptName, url: `/api/files/receipt/${e.id}`, type: e.receiptMime } : null } });
    }) as Handler,
    save: (async (ctx, _r, _u, id, body) => {
      need(ctx, id ? "edit-expense" : "create-expense");
      const parsed = expenseSchema.safeParse({ expenseDate: body.expense_date, expenseNumber: body.expense_number ?? null, categoryId: body.expense_category_id, amount: body.amount, currency: body.currency ?? ctx.settings.currency, exchangeRate: body.exchange_rate, customerId: body.customer_id ?? null, paymentMethodId: body.payment_method_id ?? null, notes: body.notes ?? null, taxes: ((body.taxes as { tax_type_id: number; amount: number }[]) ?? []).map((t) => ({ taxTypeId: t.tax_type_id, amount: t.amount })), minor: true });
      if (!parsed.success) throw new ApiError(422, "The given data was invalid.", parsed.error.flatten().fieldErrors);
      const newId = check(await saveExpense(ctx, id, parsed.data, null, cfFromBody(body)));
      return ok({ data: await db.expense.findUnique({ where: { id: newId } }) }, id ? 200 : 201);
    }) as Handler,
    remove: (async (ctx, _r, _u, _id, body) => {
      need(ctx, "delete-expense");
      return ok({ success: true, deleted: await deleteExpenses(ctx, ((body.ids as number[]) ?? []).map(Number)) });
    }) as Handler,
  },
};

const simpleLists: Record<string, (ctx: CompanyContext) => Promise<unknown[]>> = {
  "tax-types": async (ctx) => (need(ctx, "view-tax-type"), db.taxType.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } })),
  "payment-methods": async (ctx) => db.paymentMethod.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
  units: async (ctx) => db.unit.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } }),
  categories: async (ctx) => (need(ctx, "view-expense"), db.expenseCategory.findMany({ where: { companyId: ctx.companyId }, orderBy: { name: "asc" } })),
  "custom-fields": async (ctx) => (need(ctx, "view-custom-field"), db.customField.findMany({ where: { companyId: ctx.companyId }, orderBy: [{ modelType: "asc" }, { order: "asc" }] })),
  notes: async (ctx) => (need(ctx, "view-all-notes"), db.note.findMany({ where: { companyId: ctx.companyId } })),
  "recurring-invoices": async (ctx) => (need(ctx, "view-recurring-invoice"), db.recurringInvoice.findMany({ where: { companyId: ctx.companyId }, orderBy: { id: "desc" } })),
  companies: async (ctx) => ctx.memberships.map((m) => ({ id: m.companyId, name: m.company.name, slug: m.company.slug, role: m.role.title })),
};

async function login(req: Request) {
  const body = (await req.json()) as { email?: string; username?: string; password?: string; device_name?: string };
  const email = String(body.email ?? body.username ?? "").trim().toLowerCase().slice(0, 255);
  if (!throttleCredentials("api-login", clientIpFrom(req.headers), email).ok) throw new ApiError(429, "Too many attempts.");
  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  const valid = await verifyPasswordOrDummy(user?.passwordHash, String(body.password ?? "").slice(0, 1000));
  if (!user || !valid) throw new ApiError(422, "The provided credentials are incorrect.", { email: ["invalid_credentials"] });
  clearCredentialFailures("api-login", email);
  const prefix = randomToken(6).replace(/[^A-Za-z0-9]/g, "x").slice(0, 8);
  const token = `kyd_${prefix}_${randomToken(32)}`;
  await db.apiToken.create({ data: { userId: user.id, name: String(body.device_name ?? "API client").slice(0, 80), prefix, tokenHash: sha256(token) } });
  return ok({ type: "Bearer", token });
}

/** Revokes the bearer token used for this request (spec §2.2: logout invalidates the current token). */
async function logout(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!/^bearer\s+/i.test(auth)) throw new ApiError(400, "Send the token to revoke as a Bearer token.");
  const r = await db.apiToken.deleteMany({ where: { tokenHash: sha256(auth.replace(/^bearer\s+/i, "").trim()) } });
  if (!r.count) throw new ApiError(401, "Unauthenticated.");
  return ok({ success: true });
}

async function route(req: Request, segments: string[]): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  if (segments[0] === "auth" && segments[1] === "login" && method === "POST") return login(req);
  if (segments[0] === "auth" && segments[1] === "logout" && method === "POST") return logout(req);
  // Invitation answers work for signed-in users without any company yet (spec §2.4, §5.10).
  if (segments[0] === "company-invitations" && segments[1] && (segments[2] === "accept" || segments[2] === "decline") && method === "POST") {
    const user = await apiUser(method);
    const companyId = unwrap(await respondToInvitation(user, segments[1], segments[2] === "accept"));
    return ok({ success: true, company_id: companyId });
  }
  if (segments[0] === "company-invitations" && segments[1] === "pending" && method === "GET") {
    const user = await apiUser();
    const rows = await pendingInvitationsFor(user.email);
    return ok({ data: rows.map((r) => ({ id: r.id, token: r.token, company: r.company, role: r.role.title, expires_at: r.expiresAt })) });
  }
  const ctx = await apiContext(method);
  const body: Record<string, unknown> = method === "GET" || method === "DELETE" ? {} : ((await req.json().catch(() => ({}))) as Record<string, unknown>);
  const [resource, second, third] = segments;
  if (resource === "auth" && second === "check") return ok({ data: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email } });
  if (resource === "bootstrap") {
    return ok({ current_user: ctx.user, current_company: ctx.company, current_company_settings: ctx.settings, current_user_abilities: [...ctx.abilities], is_owner: ctx.isOwner, companies: ctx.memberships.map((m) => ({ id: m.companyId, name: m.company.name })) });
  }
  if (resource === "dashboard" && method === "GET") {
    need(ctx, "dashboard");
    const period = resolvePeriod(ctx.settings, url.searchParams.get("previous_year") ? "previous" : url.searchParams.get("from_date") ? "custom" : "this", url.searchParams.get("from_date") ?? undefined, url.searchParams.get("to_date") ?? undefined);
    return ok({ data: await dashboardData(ctx.companyId, ctx.settings, period), period });
  }
  if (resource === "next-number" && method === "GET") {
    const key = (url.searchParams.get("key") ?? "invoice") as NumberKind;
    if (!["invoice", "credit_note", "estimate", "payment"].includes(key)) throw new ApiError(422, "Unknown key.");
    return ok(await nextNumber(ctx.companyId, key, Number(url.searchParams.get("customer_id")) || null));
  }
  for (const router of [teamRouter, salesRouter]) {
    const res = await router({ ctx, req, url, seg: segments, method, body });
    if (res) return res;
  }
  if (simpleLists[resource] && method === "GET" && !second) return ok({ data: await simpleLists[resource](ctx) });
  const r = crud[resource as keyof typeof crud];
  if (!r) throw new ApiError(404, "Not found.");
  if (!second) {
    if (method === "GET") return r.list(ctx, req, url, null, body);
    if (method === "POST") return r.save(ctx, req, url, null, body);
  }
  if (second === "delete" && method === "POST") return r.remove(ctx, req, url, null, body);
  const id = Number(second);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(404, "Not found.");
  if (!third) {
    if (method === "GET") return r.show(ctx, req, url, id, body);
    if (method === "PUT" || method === "PATCH") return r.save(ctx, req, url, id, body);
    if (method === "DELETE") return r.remove(ctx, req, url, null, { ids: [id] });
  }
  if (method === "POST" && third === "send" && ["invoices", "estimates", "payments"].includes(resource)) {
    const kind = resource.slice(0, -1) as "invoice" | "estimate" | "payment";
    need(ctx, `send-${kind}` as "send-invoice");
    const d = await emailDefaults(ctx.companyId, kind, id);
    if (!d) throw new ApiError(404, "Not found.");
    const res = await sendDocumentEmail(ctx.companyId, kind, id, { to: String(body.to ?? d.to), cc: (body.cc as string) ?? null, bcc: (body.bcc as string) ?? null, subject: String(body.subject ?? d.subject), body: String(body.body ?? d.body) });
    if (!res.ok) throw new ApiError(422, res.error);
    return ok({ success: true });
  }
  if (method === "POST" && third === "status") {
    const status = String(body.status ?? "");
    if (resource === "invoices") {
      need(ctx, status === "SENT" ? "send-invoice" : "edit-invoice");
      check(status === "SENT" ? await markInvoiceSent(ctx, id) : status === "COMPLETED" ? await markInvoiceCompleted(ctx, id) : { ok: false, error: "Unsupported status." });
      return ok({ success: true });
    }
    if (resource === "estimates") {
      if (!["SENT", "ACCEPTED", "REJECTED"].includes(status)) throw new ApiError(422, "Unsupported status.");
      need(ctx, status === "SENT" ? "send-estimate" : "edit-estimate");
      check(await setEstimateStatus(ctx, id, status as "SENT"));
      return ok({ success: true });
    }
  }
  if (method === "POST" && third === "clone" && resource === "invoices") return (need(ctx, "create-invoice"), ok({ data: { id: check(await cloneInvoice(ctx, id)) } }, 201));
  if (method === "POST" && third === "clone" && resource === "estimates") return (need(ctx, "create-estimate"), ok({ data: { id: check(await cloneEstimate(ctx, id)) } }, 201));
  if (method === "POST" && third === "convert-to-invoice" && resource === "estimates") return (need(ctx, "create-invoice"), ok({ data: { id: check(await convertEstimateToInvoice(ctx, id)) } }, 201));
  throw new ApiError(405, "Method not allowed.");
}

async function handle(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    return await route(req, (await params).path);
  } catch (e) {
    return fail(e);
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
