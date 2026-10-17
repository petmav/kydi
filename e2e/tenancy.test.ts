import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, BASE, newToken, signCookie } from "./helpers";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createCompanyForUser, deleteCompany } from "@/lib/companies";
import { storeFile } from "@/lib/storage";

/**
 * Two-tenant isolation: tenant A (user + company) must not read or change anything that belongs to tenant B
 * through the REST API, server-rendered pages, PDFs, files (receipts, avatars), reports or the customer portal,
 * even when it names B's ids directly or spoofs B's company id in the `company` header or company cookie.
 * Also checks the browser security headers and the cookie-API CSRF guard.
 */

const stamp = Date.now();
const today = new Date().toISOString().slice(0, 10);
type Tenant = { userId: number; companyId: number; slug: string; cookie: string; token: string; email: string };
const A = {} as Tenant;
const B = {} as Tenant;
const ids = { customer: 0, item: 0, invoice: 0, estimate: 0, payment: 0, expense: 0, invoiceNumber: "", customerName: `Tenant B Secret Customer ${stamp}` };
let portalCookieB = "";
let invoiceIdA = 0;

async function provision(t: Tenant, label: string) {
  t.email = `e2e-tenant-${label}-${stamp}@kydi.test`;
  const user = await db.user.create({ data: { name: `Tenant ${label}`, email: t.email, passwordHash: await hashPassword(`tenant-${label}-passphrase-${stamp}`) } });
  t.userId = user.id;
  const company = await createCompanyForUser(user.id, { name: `E2E Tenant ${label} ${stamp}`, currency: "USD", country: "US", time_zone: "UTC" });
  t.companyId = company.id;
  t.slug = company.slug;
  const s = newToken();
  await db.session.create({ data: { tokenHash: s.hash, userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  t.cookie = `kydi_session=${signCookie(s.token)}; kydi_company=${company.id}`;
  const k = newToken();
  t.token = `kyd_e2e${label}_${k.token}`;
  await db.apiToken.create({ data: { userId: user.id, name: "e2e", prefix: `e2e${label}`, tokenHash: (await import("node:crypto")).createHash("sha256").update(t.token).digest("hex") } });
}

const get = (path: string, cookie: string, extra: Record<string, string> = {}) => fetch(`${BASE}${path}`, { headers: { Cookie: cookie, ...extra }, redirect: "manual" });

beforeAll(async () => {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health) throw new Error(`No Kydi server at ${BASE}.`);
  for (const stale of await db.user.findMany({ where: { email: { startsWith: "e2e-tenant-", endsWith: "@kydi.test" } }, include: { ownedCompanies: { select: { id: true } } } })) {
    for (const c of stale.ownedCompanies) await deleteCompany(c.id);
    await db.user.delete({ where: { id: stale.id } });
  }
  await provision(A, "a");
  await provision(B, "b");

  // Tenant B data, created through B's own API token.
  const c = await api("/api/v1/customers", { token: B.token, company: B.companyId, body: { name: ids.customerName, email: `b-cust-${stamp}@example.com`, currency: "USD" } });
  ids.customer = Number(c.json.data?.id);
  const it = await api("/api/v1/items", { token: B.token, company: B.companyId, body: { name: "Tenant B item", price: 5000 } });
  ids.item = Number(it.json.data?.id);
  const inv = await api("/api/v1/invoices", { token: B.token, company: B.companyId, body: { customer_id: ids.customer, invoice_date: today, due_date: today, items: [{ name: "Secret work", quantity: 1, price: 12345 }] } });
  ids.invoice = Number(inv.json.data?.id);
  ids.invoiceNumber = String((await db.invoice.findUniqueOrThrow({ where: { id: ids.invoice } })).invoiceNumber);
  await api(`/api/v1/invoices/${ids.invoice}/status`, { token: B.token, company: B.companyId, body: { status: "SENT" } });
  const est = await api("/api/v1/estimates", { token: B.token, company: B.companyId, body: { customer_id: ids.customer, estimate_date: today, expiry_date: today, items: [{ name: "Secret quote", quantity: 1, price: 999 }] } });
  ids.estimate = Number(est.json.data?.id);
  const pay = await api("/api/v1/payments", { token: B.token, company: B.companyId, body: { customer_id: ids.customer, payment_date: today, amount: 12345, allocations: [{ invoice_id: ids.invoice, amount: 12345 }] } });
  ids.payment = Number(pay.json.data?.id);
  const category = await db.expenseCategory.create({ data: { companyId: B.companyId, name: "Travel" } });
  const receiptPath = await storeFile(`receipts/${B.companyId}`, "receipt.pdf", Buffer.from("%PDF-1.4\n% tenant B receipt\n"));
  const exp = await db.expense.create({ data: { companyId: B.companyId, expenseDate: new Date(today), categoryId: category.id, amount: BigInt(100), baseAmount: BigInt(100), currency: "USD", receiptPath, receiptName: "b-receipt.pdf", receiptMime: "application/pdf", receiptSize: 30 } });
  ids.expense = exp.id;
  const avatarPath = await storeFile(`avatars/${B.userId}`, "avatar.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
  await db.user.update({ where: { id: B.userId }, data: { avatarPath } });
  expect(ids.customer && ids.item && ids.invoice && ids.estimate && ids.payment, JSON.stringify(ids)).toBeTruthy();

  // Tenant A has one invoice of its own; B's portal customer must not reach it.
  const ca = await api("/api/v1/customers", { token: A.token, company: A.companyId, body: { name: `Tenant A customer ${stamp}`, currency: "USD" } });
  const ia = await api("/api/v1/invoices", { token: A.token, company: A.companyId, body: { customer_id: Number(ca.json.data?.id), invoice_date: today, due_date: today, items: [{ name: "A work", quantity: 1, price: 100 }] } });
  invoiceIdA = Number(ia.json.data?.id);
  await api(`/api/v1/invoices/${invoiceIdA}/status`, { token: A.token, company: A.companyId, body: { status: "SENT" } });

  // Portal session for B's customer.
  await db.customer.update({ where: { id: ids.customer }, data: { enablePortal: true } });
  const ps = newToken();
  await db.portalSession.create({ data: { tokenHash: ps.hash, customerId: ids.customer, expiresAt: new Date(Date.now() + 3600_000) } });
  portalCookieB = `kydi_portal=${signCookie(ps.token)}`;
}, 120_000);

afterAll(async () => {
  for (const t of [A, B]) {
    if (t.companyId) await deleteCompany(t.companyId);
    if (t.userId) await db.user.delete({ where: { id: t.userId } }).catch(() => undefined);
  }
  await db.$disconnect();
}, 60_000);

describe("REST API isolation", () => {
  const resources = () => [
    ["customers", ids.customer],
    ["items", ids.item],
    ["invoices", ids.invoice],
    ["estimates", ids.estimate],
    ["payments", ids.payment],
    ["expenses", ids.expense],
  ] as const;

  it("returns 404 for B's records by id, also with B's company id in the header", async () => {
    for (const [resource, id] of resources()) {
      for (const company of [A.companyId, B.companyId]) {
        const r = await api(`/api/v1/${resource}/${id}`, { token: A.token, company });
        expect(r.status, `${resource}/${id} company=${company}`).toBe(404);
      }
    }
  });

  it("cannot update or delete B's records", async () => {
    const put = await api(`/api/v1/customers/${ids.customer}`, { method: "PUT", token: A.token, company: B.companyId, body: { name: "Hijacked", currency: "USD" } });
    expect(put.status).toBe(404);
    for (const [resource, id] of resources()) {
      await api(`/api/v1/${resource}/delete`, { token: A.token, company: B.companyId, body: { ids: [id] } });
      await api(`/api/v1/${resource}/${id}`, { method: "DELETE", token: A.token, company: B.companyId });
    }
    expect((await db.customer.findUniqueOrThrow({ where: { id: ids.customer } })).name).toBe(ids.customerName);
    expect(await db.invoice.count({ where: { id: ids.invoice } })).toBe(1);
    expect(await db.payment.count({ where: { id: ids.payment } })).toBe(1);
    expect(await db.expense.count({ where: { id: ids.expense } })).toBe(1);
    expect(await db.item.count({ where: { id: ids.item } })).toBe(1);
    expect(await db.estimate.count({ where: { id: ids.estimate } })).toBe(1);
  });

  it("lists only A's data even when the company header names B", async () => {
    for (const resource of ["customers", "invoices", "estimates", "payments", "expenses", "items"]) {
      const r = await api(`/api/v1/${resource}?limit=all`, { token: A.token, company: B.companyId });
      expect(r.status, resource).toBe(200);
      expect(JSON.stringify(r.json), resource).not.toContain(ids.customerName);
      const rows = (r.json.data as unknown as { companyId?: number }[]) ?? [];
      for (const row of rows) if (row.companyId !== undefined) expect(row.companyId).toBe(A.companyId);
    }
    const dash = await api("/api/v1/dashboard", { token: A.token, company: B.companyId });
    expect(JSON.stringify(dash.json)).not.toContain(ids.customerName);
  });

  it("cannot send B's documents or read B's statements and stats", async () => {
    expect((await api(`/api/v1/invoices/${ids.invoice}/send`, { token: A.token, company: B.companyId, body: { to: "attacker@example.org" } })).status).toBe(404);
    expect((await api(`/api/v1/customers/${ids.customer}/stats`, { token: A.token, company: B.companyId })).status).not.toBe(200);
    expect((await api(`/api/v1/invoices/${ids.invoice}/clone`, { token: A.token, company: B.companyId, body: {} })).status).not.toBe(201);
  });
});

describe("pages, PDFs, files and reports", () => {
  it("does not render B's records for A, even with B's company cookie", async () => {
    const spoofed = A.cookie.replace(`kydi_company=${A.companyId}`, `kydi_company=${B.companyId}`);
    for (const cookie of [A.cookie, spoofed]) {
      for (const path of [`/invoices/${ids.invoice}`, `/invoices/${ids.invoice}/edit`, `/customers/${ids.customer}`, `/estimates/${ids.estimate}`, `/payments/${ids.payment}`, `/expenses/${ids.expense}/edit`, `/items/${ids.item}/edit`]) {
        const res = await get(path, cookie);
        const html = res.status === 200 ? await res.text() : "";
        expect(res.status === 404 || !html.includes(ids.customerName), `${path} status ${res.status}`).toBe(true);
        expect(html).not.toContain(ids.customerName);
      }
    }
  });

  it("refuses B's PDFs, receipt and avatar", async () => {
    const spoofed = A.cookie.replace(`kydi_company=${A.companyId}`, `kydi_company=${B.companyId}`);
    for (const cookie of [A.cookie, spoofed]) {
      expect((await get(`/api/pdf/invoice/${ids.invoice}`, cookie)).status).toBe(404);
      expect((await get(`/api/pdf/estimate/${ids.estimate}`, cookie)).status).toBe(404);
      expect((await get(`/api/pdf/payment/${ids.payment}`, cookie)).status).toBe(404);
      expect((await get(`/api/files/receipt/${ids.expense}`, cookie)).status).toBe(404);
      expect((await get(`/api/files/avatar/${B.userId}`, cookie)).status).toBe(404);
      expect((await get(`/api/reports/statement/${ids.customer}?type=activity&from=2000-01-01&to=${today}`, cookie)).status).toBe(404);
    }
    // Sanity: B itself can read them.
    expect((await get(`/api/pdf/invoice/${ids.invoice}`, B.cookie)).status).toBe(200);
    expect((await get(`/api/files/receipt/${ids.expense}`, B.cookie)).status).toBe(200);
    expect((await get(`/api/files/avatar/${B.userId}`, B.cookie)).status).toBe(200);
  });

  it("keeps report pages scoped to the active company", async () => {
    const res = await get(`/reports?type=sales-customers&from=2000-01-01&to=${today}`, A.cookie.replace(`kydi_company=${A.companyId}`, `kydi_company=${B.companyId}`));
    const html = res.status === 200 ? await res.text() : "";
    expect(html).not.toContain(ids.customerName);
  });

  it("refuses anonymous access to private routes", async () => {
    for (const path of [`/api/pdf/invoice/${ids.invoice}`, `/api/files/receipt/${ids.expense}`, `/api/files/avatar/${B.userId}`, `/api/reports/statement/${ids.customer}?type=activity&from=2000-01-01&to=${today}`]) {
      expect((await get(path, "")).status, path).toBe(401);
    }
    expect((await api(`/api/v1/invoices/${ids.invoice}`)).status).toBe(401);
  });
});

describe("customer portal isolation", () => {
  it("lets B's portal customer see only their own company's documents", async () => {
    expect((await get(`/portal/${B.slug}/pdf/invoices/${ids.invoice}`, portalCookieB)).status).toBe(200);
    expect((await get(`/portal/${B.slug}/pdf/invoices/${invoiceIdA}`, portalCookieB)).status).toBe(404);
    expect((await get(`/portal/${A.slug}/pdf/invoices/${invoiceIdA}`, portalCookieB)).status).toBe(401);
    const res = await get(`/portal/${A.slug}`, portalCookieB);
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get("location") ?? "").toContain(`/portal/${A.slug}/login`);
  });

  it("does not accept a staff session as a portal session", async () => {
    expect((await get(`/portal/${B.slug}/pdf/invoices/${ids.invoice}`, B.cookie)).status).toBe(401);
  });
});

describe("cookie-authenticated API writes (CSRF)", () => {
  it("refuses cross-site writes and accepts same-origin ones", async () => {
    const body = JSON.stringify({ name: `CSRF probe ${stamp}`, currency: "USD" });
    const headers = { Cookie: A.cookie, "Content-Type": "application/json", company: String(A.companyId) };
    const evil = await fetch(`${BASE}/api/v1/customers`, { method: "POST", headers: { ...headers, Origin: "https://evil.example.org", "Sec-Fetch-Site": "cross-site" }, body });
    expect(evil.status).toBe(403);
    const sibling = await fetch(`${BASE}/api/v1/customers`, { method: "POST", headers: { ...headers, Origin: "https://other-app.example.org", "Sec-Fetch-Site": "same-site" }, body });
    expect(sibling.status).toBe(403);
    const none = await fetch(`${BASE}/api/v1/customers`, { method: "POST", headers, body });
    expect(none.status).toBe(403);
    const same = await fetch(`${BASE}/api/v1/customers`, { method: "POST", headers: { ...headers, Origin: BASE, "Sec-Fetch-Site": "same-origin" }, body });
    expect([200, 201]).toContain(same.status);
  });
});

describe("browser security headers", () => {
  it("sends CSP with a nonce, anti-framing and hardening headers on pages", async () => {
    const res = await fetch(`${BASE}/login`, { redirect: "manual" });
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
    expect(res.headers.get("strict-transport-security")).toBeNull();
    const html = res.status === 200 ? await res.text() : "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    for (const s of scripts) expect(s).toContain(`nonce="${nonce}"`);
  });

  it("adds HSTS behind an https proxy and allows same-origin framing of PDFs only", async () => {
    const https = await fetch(`${BASE}/login`, { headers: { "x-forwarded-proto": "https" }, redirect: "manual" });
    expect(https.headers.get("strict-transport-security")).toContain("max-age=");
    expect(https.headers.get("content-security-policy")).toContain("upgrade-insecure-requests");
    const pdf = await get(`/api/pdf/invoice/${ids.invoice}`, B.cookie);
    expect(pdf.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(pdf.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    const health = await fetch(`${BASE}/api/health`);
    expect(await health.json()).toEqual({ status: "ok" });
    expect(health.headers.get("x-frame-options")).toBe("DENY");
  });
});
