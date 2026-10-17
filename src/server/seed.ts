import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createCompanyForUser } from "@/lib/companies";
import { getCompanySettings } from "@/lib/settings";
import { ALL_ABILITIES } from "@/lib/abilities";
import { addDaysIso, todayIn } from "@/lib/dates";
import type { CompanyContext } from "@/lib/auth/context";
import { saveInvoice, markInvoiceSent } from "./invoices";
import { saveEstimate, setEstimateStatus } from "./estimates";

import { DEMO_EMAIL, DEMO_PASSWORD } from "./demo-credentials";

export { DEMO_EMAIL, DEMO_PASSWORD };

type Ctx = CompanyContext;

/** Builds a server-side context for background work / seeding (owner powers). */
export async function systemContext(companyId: number, userId: number): Promise<Ctx> {
  const company = (await db.company.findUnique({ where: { id: companyId } }))!;
  const user = (await db.user.findUnique({ where: { id: userId } }))!;
  const settings = await getCompanySettings(companyId);
  const role = (await db.role.findFirst({ where: { companyId, isOwner: true } }))!;
  const abilities = new Set<string>(ALL_ABILITIES);
  return { user, company, companyId, role, memberships: [], abilities, settings, isOwner: true, isSuperAdmin: false, can: () => true } as unknown as Ctx;
}

/** Hook so later modules (payments, expenses, recurring) can add demo data. */
type Extra = (ctx: Ctx, refs: SeedRefs) => Promise<void>;
export type SeedRefs = { customers: { id: number; name: string; currency: string }[]; invoices: number[]; today: string; taxes: Record<string, number> };

/** Demo data is refused in production unless KYDI_DEMO_SEED=true is set explicitly. */
export function demoSeedAllowed(env: { NODE_ENV?: string; KYDI_DEMO_SEED?: string } = process.env): boolean {
  return env.NODE_ENV !== "production" || env.KYDI_DEMO_SEED === "true";
}

export async function seedDemo(extra?: Extra): Promise<{ created: boolean }> {
  if (!demoSeedAllowed()) {
    throw new Error("Refusing to seed demo data in production. Set KYDI_DEMO_SEED=true explicitly (never on an instance with real data).");
  }
  if ((await db.user.count()) > 0) return { created: false };
  const user = await db.user.create({ data: { name: "Alex Morgan", email: DEMO_EMAIL, passwordHash: await hashPassword(DEMO_PASSWORD), role: "SUPER_ADMIN" } });
  const company = await createCompanyForUser(user.id, { name: "Northwind Studio", currency: "USD", country: "US", time_zone: "America/New_York", date_format: "MMM d, yyyy", locale: "en-US", fiscal_year: "1-12" });
  await db.company.update({
    where: { id: company.id },
    data: { street1: "500 Market Street", street2: "Suite 210", city: "San Francisco", state: "CA", zip: "94105", phone: "+1 415 555 0100", taxId: "94-1234567" },
  });
  await db.companySetting.upsert({ where: { companyId_key: { companyId: company.id, key: "notification_email" } }, create: { companyId: company.id, key: "notification_email", value: DEMO_EMAIL }, update: {} });
  const cid = company.id;

  const taxes = {
    salesTax: (await db.taxType.create({ data: { companyId: cid, name: "Sales tax", percent: 8.5, description: "State and local sales tax" } })).id,
    vat: (await db.taxType.create({ data: { companyId: cid, name: "VAT", percent: 20 } })).id,
    eco: (await db.taxType.create({ data: { companyId: cid, name: "Eco fee", calculationType: "FIXED", fixedAmount: 150 } })).id,
    local: (await db.taxType.create({ data: { companyId: cid, name: "City surcharge", percent: 5, compound: true } })).id,
    input: (await db.taxType.create({ data: { companyId: cid, name: "Input VAT", percent: 20, transactionType: "PURCHASES" } })).id,
  };
  for (const name of ["Travel", "Software", "Office supplies", "Meals", "Contractors"]) await db.expenseCategory.create({ data: { companyId: cid, name } });
  await db.note.create({ data: { companyId: cid, type: "Invoice", name: "Payment terms", isDefault: true, notes: "<p>Payment is due within 14 days. Please include the invoice number with your transfer.</p><p>Bank: First National · Account 12345678 · Routing 021000021</p>" } });
  await db.note.create({ data: { companyId: cid, type: "Estimate", name: "Validity", isDefault: true, notes: "<p>This estimate is valid for 30 days. Prices exclude travel unless stated.</p>" } });
  await db.note.create({ data: { companyId: cid, type: "Payment", name: "Thank you", isDefault: true, notes: "<p>Thank you for your business, {CONTACT_DISPLAY_NAME}.</p>" } });

  const units = Object.fromEntries((await db.unit.findMany({ where: { companyId: cid } })).map((u) => [u.name, u.id]));
  const hour = await db.unit.create({ data: { companyId: cid, name: "hour" } });
  const items = [
    { name: "Brand strategy workshop", price: 180000, unitId: null, description: "Half-day facilitated session with deliverables" },
    { name: "Web design", price: 12500, unitId: hour.id, description: "Design and prototyping, hourly" },
    { name: "Front-end development", price: 11000, unitId: hour.id, description: "Implementation, hourly" },
    { name: "Hosting (monthly)", price: 4900, unitId: units.pc, description: "Managed hosting and backups" },
    { name: "Logo package", price: 95000, unitId: units.pc, description: "Primary logo, variations and guidelines" },
    { name: "Printed brochures", price: 250, unitId: units.pc, description: "A5, 2-sided, matte" },
  ];
  const itemRows: Awaited<ReturnType<typeof db.item.create>>[] = [];
  for (const it of items) itemRows.push(await db.item.create({ data: { ...it, companyId: cid, creatorId: user.id } }));

  const custData = [
    { name: "Acme Corporation", email: "billing@acme.test", contactName: "Jordan Lee", currency: "USD", prefix: "ACME", billingCity: "Austin", billingState: "TX", billingCountry: "US", billingStreet1: "100 Congress Ave", billingZip: "78701", enablePortal: true },
    { name: "Globex Industries", email: "ap@globex.test", contactName: "Priya Shah", currency: "USD", billingCity: "Chicago", billingState: "IL", billingCountry: "US", billingStreet1: "233 S Wacker Dr", billingZip: "60606" },
    { name: "Initech LLC", email: "accounts@initech.test", contactName: "Bill Lumbergh", currency: "USD", billingCity: "Dallas", billingCountry: "US", billingStreet1: "4120 Freidrich Ln" },
    { name: "Umbrella Health", email: "finance@umbrella.test", contactName: "Alice Abernathy", currency: "USD", billingCity: "Raccoon City", billingCountry: "US" },
    { name: "Stark Atelier GmbH", email: "buchhaltung@stark.test", contactName: "Klara Stark", currency: "EUR", billingCity: "Berlin", billingCountry: "DE", billingStreet1: "Friedrichstraße 68", billingZip: "10117" },
    { name: "Wayne Foundation", email: "grants@wayne.test", contactName: "Lucius Fox", currency: "USD", billingCity: "Gotham", billingCountry: "US" },
  ];
  const portalHash = await hashPassword(DEMO_PASSWORD);
  const customers: Awaited<ReturnType<typeof db.customer.create>>[] = [];
  for (const c of custData) customers.push(await db.customer.create({ data: { ...c, companyId: cid, creatorId: user.id, portalPasswordHash: c.enablePortal ? portalHash : null } }));

  const ctx = await systemContext(cid, user.id);
  const today = todayIn(ctx.settings.time_zone);
  await db.exchangeRateLog.create({ data: { companyId: cid, currency: "EUR", baseCurrency: "USD", rate: 1.08 } });

  const pick = (i: number) => itemRows[i % itemRows.length];
  const invoices: number[] = [];
  const plan = [
    { c: 0, daysAgo: 300, lines: [[0, 1], [4, 1]], send: true },
    { c: 1, daysAgo: 250, lines: [[1, 24], [2, 40]], send: true },
    { c: 2, daysAgo: 200, lines: [[3, 6]], send: true },
    { c: 3, daysAgo: 160, lines: [[1, 12], [5, 500]], send: true },
    { c: 4, daysAgo: 120, lines: [[0, 1]], send: true },
    { c: 0, daysAgo: 90, lines: [[2, 32]], send: true },
    { c: 5, daysAgo: 60, lines: [[4, 1], [1, 10]], send: true },
    { c: 1, daysAgo: 40, lines: [[3, 12]], send: true },
    { c: 2, daysAgo: 25, lines: [[1, 16], [2, 20]], send: true },
    { c: 0, daysAgo: 10, lines: [[0, 1], [3, 3]], send: true },
    { c: 3, daysAgo: 3, lines: [[5, 1000]], send: false },
    { c: 5, daysAgo: 1, lines: [[2, 8]], send: false },
  ];
  for (const p of plan) {
    const cust = customers[p.c];
    const date = addDaysIso(today, -p.daysAgo);
    const rate = cust.currency === "USD" ? 1 : 1.08;
    const res = await saveInvoice(
      ctx,
      null,
      {
        customerId: cust.id,
        date,
        closingDate: addDaysIso(date, 14),
        number: "",
        referenceNumber: null,
        exchangeRate: rate,
        discountType: "PERCENTAGE",
        discount: p.c === 1 ? 5 : 0,
        taxIncluded: false,
        notes: "<p>Payment is due within 14 days. Please include the invoice number with your transfer.</p>",
        templateName: ["invoice1", "invoice2", "invoice3"][invoices.length % 3],
        taxes: [taxes.salesTax],
        lines: p.lines.map(([i, q]) => ({ itemId: pick(i).id, name: pick(i).name, description: pick(i).description, unitName: null, quantity: q, price: (Number(pick(i).price) / 100 / rate).toFixed(2), discountType: "FIXED" as const, discount: 0, taxes: [] })),
      },
      {},
    );
    if (!res.ok) throw new Error(`seed invoice failed: ${res.error} ${JSON.stringify(res.fieldErrors)}`);
    if (p.send) await markInvoiceSent(ctx, res.id);
    await db.invoice.update({ where: { id: res.id }, data: { createdAt: new Date(`${date}T12:00:00Z`) } });
    invoices.push(res.id);
  }

  const estPlan = [
    { c: 1, daysAgo: 20, status: "ACCEPTED" as const },
    { c: 2, daysAgo: 12, status: "SENT" as const },
    { c: 5, daysAgo: 5, status: "SENT" as const },
    { c: 3, daysAgo: 2, status: null },
  ];
  for (const e of estPlan) {
    const cust = customers[e.c];
    const date = addDaysIso(today, -e.daysAgo);
    const res = await saveEstimate(
      ctx,
      null,
      {
        customerId: cust.id,
        date,
        closingDate: addDaysIso(date, 30),
        number: "",
        referenceNumber: null,
        exchangeRate: 1,
        discountType: "FIXED",
        discount: 0,
        taxIncluded: false,
        notes: "<p>This estimate is valid for 30 days.</p>",
        templateName: "estimate1",
        taxes: [taxes.salesTax],
        lines: [
          { itemId: itemRows[0].id, name: itemRows[0].name, description: itemRows[0].description, unitName: null, quantity: 1, price: "1800.00", discountType: "FIXED", discount: 0, taxes: [] },
          { itemId: itemRows[1].id, name: itemRows[1].name, description: itemRows[1].description, unitName: "hour", quantity: 20, price: "125.00", discountType: "FIXED", discount: 0, taxes: [] },
        ],
      },
      {},
    );
    if (!res.ok) throw new Error(`seed estimate failed: ${res.error}`);
    if (e.status) await setEstimateStatus(ctx, res.id, e.status === "ACCEPTED" ? "SENT" : e.status).catch(() => undefined);
    if (e.status === "ACCEPTED") await setEstimateStatus(ctx, res.id, "ACCEPTED");
  }

  if (extra) await extra(ctx, { customers: customers.map((c) => ({ id: c.id, name: c.name, currency: c.currency })), invoices, today, taxes });
  return { created: true };
}
