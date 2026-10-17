import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, BASE, newToken, page, signCookie } from "./helpers";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createCompanyForUser, deleteCompany } from "@/lib/companies";
import { getCompanySettings } from "@/lib/settings";
import { ALL_ABILITIES, type Ability } from "@/lib/abilities";
import type { CompanyContext } from "@/lib/auth/context";
import { parseRecurringPayload, isMakeRecurring } from "@/server/invoice-payload";
import { saveRecurring } from "@/server/recurring";
import { allocateCredit, saveBill, saveRefund, saveSupplier, saveSupplierPayment, voidSupplierPayment } from "@/server/purchasing";

/**
 * End-to-end smoke suite (run with `npm run test:e2e` against a running server; see README).
 * Provisions an isolated administrator + company, exercises the core billing loop over HTTP, renders the main
 * screens with a real session cookie, and checks the make-recurring and purchasing services against the database.
 */

const stamp = Date.now();
const email = `e2e-${stamp}@kydi.test`;
const password = "e2e-password-123";
let userId = 0;
let companyId = 0;
let cookie = "";
let token = "";
let customerId = 0;
let invoiceId = 0;
const today = new Date().toISOString().slice(0, 10);

async function context(): Promise<CompanyContext> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const memberships = await db.companyUser.findMany({ where: { userId }, include: { company: true, role: true }, orderBy: { createdAt: "asc" } });
  const m = memberships.find((x) => x.companyId === companyId)!;
  const abilities = new Set<string>(ALL_ABILITIES);
  const settings = await getCompanySettings(companyId);
  return { user, company: m.company, companyId, role: m.role, memberships, abilities, settings, isOwner: true, isSuperAdmin: true, can: (a: Ability) => abilities.has(a) } as CompanyContext;
}

beforeAll(async () => {
  const health = await fetch(`${BASE}/login`).catch(() => null);
  if (!health) throw new Error(`No Kydi server at ${BASE}. Start one (npm run build && npx next start -p 3100) or set E2E_BASE_URL.`);
  // Remove leftovers of interrupted runs.
  for (const stale of await db.user.findMany({ where: { email: { startsWith: "e2e-", endsWith: "@kydi.test" } }, include: { ownedCompanies: { select: { id: true } } } })) {
    for (const c of stale.ownedCompanies) await deleteCompany(c.id);
    await db.user.delete({ where: { id: stale.id } });
  }
  const user = await db.user.create({ data: { name: "E2E Admin", email, passwordHash: await hashPassword(password), role: "SUPER_ADMIN" } });
  userId = user.id;
  const company = await createCompanyForUser(user.id, { name: `E2E Company ${stamp}`, currency: "USD", country: "US", time_zone: "UTC" });
  companyId = company.id;
  const t = newToken();
  await db.session.create({ data: { tokenHash: t.hash, userId, expiresAt: new Date(Date.now() + 3600_000) } });
  cookie = `kydi_session=${signCookie(t.token)}; kydi_company=${companyId}`;
}, 60_000);

afterAll(async () => {
  if (companyId) await deleteCompany(companyId);
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
}, 60_000);

describe("core billing loop over HTTP", () => {
  it("serves the login page and logs in through the API", async () => {
    const login = await fetch(`${BASE}/login`);
    expect(login.status).toBe(200);
    expect(await login.text()).toContain("Sign in");
    const bad = await api("/api/v1/auth/login", { body: { email, password: "wrong-password", device_name: "e2e" } });
    expect(bad.status).toBe(422);
    const ok = await api("/api/v1/auth/login", { body: { email, password, device_name: "e2e" } });
    expect(ok.status).toBe(200);
    token = String(ok.json.token);
    expect(token).toMatch(/^kyd_/);
    const me = await api("/api/v1/me", { token, company: companyId });
    expect(me.status).toBe(200);
  });

  it("creates a customer", async () => {
    const r = await api("/api/v1/customers", { token, company: companyId, body: { name: "Acme Testing Ltd", email: `acme-${stamp}@example.com`, currency: "USD" } });
    expect([200, 201]).toContain(r.status);
    customerId = Number(r.json.data?.id);
    expect(customerId).toBeGreaterThan(0);
  });

  it("creates an invoice with server-computed totals", async () => {
    const r = await api("/api/v1/invoices", {
      token,
      company: companyId,
      body: { customer_id: customerId, invoice_date: today, due_date: today, items: [{ name: "Consulting", quantity: 2, price: 15000 }] },
    });
    expect([200, 201]).toContain(r.status);
    invoiceId = Number(r.json.data?.id);
    expect(invoiceId).toBeGreaterThan(0);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(Number(inv.total)).toBe(30000);
    expect(Number(inv.dueAmount)).toBe(30000);
  });

  it("marks the invoice as sent and records a payment that settles it", async () => {
    const sent = await api(`/api/v1/invoices/${invoiceId}/status`, { token, company: companyId, body: { status: "SENT" } });
    expect(sent.status, JSON.stringify(sent.json)).toBe(200);
    const r = await api("/api/v1/payments", { token, company: companyId, body: { customer_id: customerId, payment_date: today, amount: 30000, allocations: [{ invoice_id: invoiceId, amount: 30000 }] } });
    expect([200, 201], JSON.stringify(r.json)).toContain(r.status);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(Number(inv.dueAmount)).toBe(0);
    expect(inv.paidStatus).toBe("PAID");
  });

  it("downloads the invoice PDF", async () => {
    const res = await fetch(`${BASE}/api/pdf/invoice/${invoiceId}`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("make-recurring switch on a new invoice", () => {
  it("saves a recurring invoice instead of an invoice", async () => {
    // Shape sent by the invoice form when "Make recurring" is switched on (src/components/documents/document-form.tsx).
    const payload = {
      customerId,
      date: today,
      closingDate: null,
      number: "",
      referenceNumber: null,
      exchangeRate: 1,
      discountType: "FIXED",
      discount: 0,
      taxIncluded: false,
      notes: "<p>Monthly retainer</p><script>alert(1)</script>",
      templateName: "invoice1",
      taxes: [],
      lines: [{ itemId: null, name: "Retainer", description: null, unitName: null, quantity: 1, price: "250.00", discountType: "FIXED", discount: 0, taxes: [], customFields: null }],
      recurring: { startsAt: today, frequency: "0 0 1 * *", limitBy: "COUNT", limitCount: "12", limitDate: "", status: "ACTIVE", sendAutomatically: false, notifyCreator: false },
      makeRecurring: true,
    };
    expect(isMakeRecurring(payload, null)).toBe(true);
    expect(isMakeRecurring(payload, invoiceId)).toBe(false);
    const parsed = parseRecurringPayload(payload);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const invoicesBefore = await db.invoice.count({ where: { companyId } });
    const res = await saveRecurring(await context(), null, parsed.doc, parsed.rec, {});
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (!res.ok) return;
    const rec = await db.recurringInvoice.findUniqueOrThrow({ where: { id: res.id }, include: { lines: true } });
    expect(rec.frequency).toBe("0 0 1 * *");
    expect(rec.limitBy).toBe("COUNT");
    expect(rec.limitCount).toBe(12);
    expect(rec.nextInvoiceAt).not.toBeNull();
    expect(rec.lines).toHaveLength(1);
    expect(Number(rec.total)).toBe(25000);
    expect(rec.notes).toBe("<p>Monthly retainer</p>");
    expect(await db.invoice.count({ where: { companyId } })).toBe(invoicesBefore);
  });

  it("reports field errors for an incomplete schedule", () => {
    const r = parseRecurringPayload({ customerId, lines: [{ name: "x", quantity: 1, price: "1" }], makeRecurring: true, recurring: { frequency: "0 0 1 * *" } });
    expect(r.ok).toBe(false);
  });
});

describe("purchasing services", () => {
  it("runs a bill through payment, void, credit and refund rules", async () => {
    const ctx = await context();
    const category = await db.expenseCategory.create({ data: { companyId, name: "Office supplies" } });
    const vat = await db.taxType.create({ data: { companyId, name: "Input VAT", percent: 20, transactionType: "PURCHASES" } });
    const sup = await saveSupplier(ctx, null, { name: "Paper Mill GmbH", contactName: null, email: null, phone: null, website: null, taxId: null, currency: "USD", expenseCategoryId: category.id, paymentTerms: 14, street1: null, street2: null, city: null, state: null, zip: null, country: null, notes: null, enabled: true });
    expect(sup.ok).toBe(true);
    if (!sup.ok) return;
    // 3 x 12.50 with 10% discount = 33.75 + 20% VAT 6.75 = 40.50
    const bill = await saveBill(ctx, null, {
      type: "BILL",
      supplierId: sup.id,
      number: "",
      reference: "INV-778",
      documentDate: today,
      dueDate: null,
      exchangeRate: 1,
      taxIncluded: false,
      notes: null,
      sourceBillId: null,
      intent: "open",
      lines: [{ expenseCategoryId: category.id, description: "A4 paper", quantity: 3, price: "12.50", discountType: "PERCENTAGE", discount: "10", taxTypeIds: [vat.id], sourceBillLineId: null }],
    });
    expect(bill.ok).toBe(true);
    if (!bill.ok) return;
    let b = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(b.status).toBe("OPEN");
    expect(Number(b.total)).toBe(4050);
    expect(Number(b.tax)).toBe(675);
    expect(b.number).toBe("BILL-000001");

    const pay = await saveSupplierPayment(ctx, null, { supplierId: sup.id, number: "", reference: null, paymentDate: today, amount: "30.00", exchangeRate: 1, paymentMethodId: null, notes: null, allocations: [{ billId: bill.id, amount: "30.00" }] });
    expect(pay.ok).toBe(true);
    if (!pay.ok) return;
    b = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(Number(b.dueAmount)).toBe(1050);
    expect(b.financialLockedAt).not.toBeNull();

    const over = await saveSupplierPayment(ctx, null, { supplierId: sup.id, number: "", reference: null, paymentDate: today, amount: "50.00", exchangeRate: 1, paymentMethodId: null, notes: null, allocations: [{ billId: bill.id, amount: "20.00" }] });
    expect(over.ok).toBe(false);

    expect((await voidSupplierPayment(ctx, pay.id, "")).ok).toBe(false);
    expect((await voidSupplierPayment(ctx, pay.id, "Bank reversal")).ok).toBe(true);
    b = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(Number(b.dueAmount)).toBe(4050);
    expect(b.financialLockedAt).toBeNull();

    // A credit raised against the bill is applied to it straight away.
    const credit = await saveBill(ctx, null, {
      type: "SUPPLIER_CREDIT",
      supplierId: sup.id,
      number: "",
      reference: null,
      documentDate: today,
      dueDate: null,
      exchangeRate: 1,
      taxIncluded: false,
      notes: null,
      sourceBillId: bill.id,
      intent: "open",
      lines: [{ expenseCategoryId: category.id, description: "Damaged ream", quantity: 1, price: "10.00", discountType: "PERCENTAGE", discount: "0", taxTypeIds: [], sourceBillLineId: null }],
    });
    expect(credit.ok).toBe(true);
    if (!credit.ok) return;
    b = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(Number(b.dueAmount)).toBe(3050);

    // Refund limited to the unallocated part of the credit (fully allocated here).
    const refund = await saveRefund(ctx, { source: `credit:${credit.id}`, number: "", reference: null, paymentDate: today, amount: "1.00", exchangeRate: 1, paymentMethodId: null, notes: null });
    expect(refund.ok).toBe(false);
    expect((await allocateCredit(ctx, credit.id, [])).ok).toBe(true);
    const refund2 = await saveRefund(ctx, { source: `credit:${credit.id}`, number: "", reference: null, paymentDate: today, amount: "10.00", exchangeRate: 1, paymentMethodId: null, notes: null });
    expect(refund2.ok).toBe(true);
    b = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(Number(b.dueAmount)).toBe(4050);
  }, 60_000);
});

describe("screens render for the administrator", () => {
  const pages = [
    "/dashboard",
    "/customers",
    "/invoices",
    "/recurring-invoices",
    "/suppliers",
    "/bills",
    "/bills?tab=credits",
    "/bills?tab=recurring",
    "/bills/new",
    "/supplier-payments",
    "/supplier-payments/new",
    "/supplier-payments/refund/new",
    "/recurring-costs/new",
    "/purchases",
    "/reports?tab=purchases",
    "/reports?tab=profit-loss",
    "/settings/mail",
    "/settings/exchange-rates",
    "/settings/ownership",
    "/settings/customization?tab=purchases",
    "/settings/notes",
    "/profile",
    "/admin",
    "/admin/companies",
    "/admin/users",
    "/admin/role-presets",
    "/admin/mail",
    "/admin/system",
  ];

  it.each(pages)("GET %s returns 200", async (p) => {
    const r = await page(p, cookie);
    expect(r.status, `${p} -> ${r.location ?? ""}`).toBe(200);
    expect(r.html).not.toContain("Application error");
  });

  it("renders the customer split view and the supplier and bill screens", async () => {
    const c = await page(`/customers/${customerId}`, cookie);
    expect(c.status).toBe(200);
    expect(c.html).toContain("Search customers");
    expect(c.html).toContain("Cash flow");
    const bill = await db.bill.findFirstOrThrow({ where: { companyId, type: "BILL" } });
    expect((await page(`/bills/${bill.id}`, cookie)).status).toBe(200);
    expect((await page(`/bills/${bill.id}/edit`, cookie)).status).toBe(200);
    expect((await page(`/suppliers/${bill.supplierId}`, cookie)).status).toBe(200);
    const pdf = await fetch(`${BASE}/api/reports/purchases/pdf?from=${today}&to=${today}`, { headers: { Cookie: cookie } });
    expect(pdf.status).toBe(200);
  });

  it("protects avatars and admin screens", async () => {
    expect((await fetch(`${BASE}/api/files/avatar/${userId}`)).status).toBe(401);
    expect((await page("/admin", "")).status).toBe(307);
  });
});
