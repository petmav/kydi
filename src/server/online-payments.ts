import type { Customer } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/secrets";
import { randomToken } from "@/lib/auth/tokens";
import { getCompanySettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { getBaseUrl } from "@/lib/url";
import { env } from "@/lib/env";
import { checkStripeKey, createCheckoutSession, retrieveCheckoutSession, StripeError, stripeKeyMode, toStripeAmount } from "@/lib/stripe";
import { sendCompanyMail } from "@/server/mailer";
import { openInvoices, recordOnlinePayment } from "@/server/payments";

/**
 * Customer-portal online payments: a customer pays an invoice's full outstanding balance through Stripe Checkout,
 * or through the built-in demo gateway (no money moves; for previews). Confirmed checkouts become Payments via
 * recordOnlinePayment, which is idempotent per OnlinePayment row.
 */

export const GATEWAY_DRIVERS = ["demo", "stripe"] as const;
export type GatewayDriver = (typeof GATEWAY_DRIVERS)[number];
export const GATEWAY_LABELS: Record<GatewayDriver, string> = { demo: "Demo (no real money)", stripe: "Stripe Checkout" };
const isDriver = (v: unknown): v is GatewayDriver => GATEWAY_DRIVERS.includes(v as GatewayDriver);

/**
 * The demo gateway records payments without moving money, so it is only offered in development and on
 * demo-seeded installs (the Zenith preview). A production install never treats it as active.
 */
export function demoGatewayAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || env.demoSeed;
}

/** Browser-safe view: secrets are reduced to "is set" flags. */
export type GatewayView = { enabled: boolean; driver: GatewayDriver; secretsSet: string[]; mode: "test" | "live" | null; demoAllowed: boolean };

async function gatewayRow(companyId: number) {
  return db.paymentGateway.findUnique({ where: { companyId } });
}

/** The active gateway, or null when online payments are off for this company. */
export async function activeGateway(companyId: number): Promise<{ driver: GatewayDriver; secrets: Record<string, string> } | null> {
  const r = await gatewayRow(companyId);
  if (!r || !r.enabled || !isDriver(r.driver)) return null;
  const secrets = decryptJson(r.secrets);
  if (r.driver === "stripe" && !secrets.secretKey) return null;
  if (r.driver === "demo" && !demoGatewayAllowed()) return null;
  return { driver: r.driver, secrets };
}

export async function getGatewayView(companyId: number): Promise<GatewayView> {
  const r = await gatewayRow(companyId);
  const demoAllowed = demoGatewayAllowed();
  if (!r || !isDriver(r.driver)) return { enabled: false, driver: demoAllowed ? "demo" : "stripe", secretsSet: [], mode: null, demoAllowed };
  const secrets = decryptJson(r.secrets);
  return { enabled: r.enabled, driver: r.driver, secretsSet: Object.keys(secrets), mode: r.driver === "stripe" ? stripeKeyMode(secrets.secretKey) : null, demoAllowed };
}

export async function saveGateway(companyId: number, form: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }> {
  const existing = await gatewayRow(companyId);
  if (!["on", "true", "1"].includes(String(form.enabled ?? ""))) {
    if (existing) await db.paymentGateway.update({ where: { id: existing.id }, data: { enabled: false } });
    return { ok: true };
  }
  if (!isDriver(form.driver)) return { ok: false, error: "Choose a gateway.", fieldErrors: { driver: ["Choose a gateway."] } };
  const driver = form.driver;
  if (driver === "demo" && !demoGatewayAllowed()) return { ok: false, error: "The demo gateway is not available on a production install.", fieldErrors: { driver: ["Choose Stripe Checkout."] } };
  let secrets: Record<string, string> = {};
  if (driver === "stripe") {
    // Blank secret inputs keep the stored value while the driver stays the same.
    const keep = existing?.driver === "stripe" ? decryptJson(existing.secrets) : {};
    const secretKey = String(form.secretKey ?? "").trim() || keep.secretKey || "";
    const webhookSecret = String(form.webhookSecret ?? "").trim() || keep.webhookSecret || "";
    const errors: Record<string, string[]> = {};
    if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(secretKey)) errors.secretKey = ["Enter a Stripe restricted key (rk_test_… / rk_live_…) or secret key."];
    // Stripe requires a webhook for reliable fulfilment: customers may close the tab before returning.
    if (!webhookSecret) errors.webhookSecret = ["Enter the webhook signing secret (whsec_…)."];
    else if (!/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)) errors.webhookSecret = ["Webhook signing secrets start with whsec_."];
    if (Object.keys(errors).length) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: errors };
    secrets = { secretKey, webhookSecret };
  }
  const data = { enabled: true, driver, options: {}, secrets: encryptJson(secrets) };
  if (existing) await db.paymentGateway.update({ where: { id: existing.id }, data });
  else await db.paymentGateway.create({ data: { ...data, companyId } });
  return { ok: true };
}

export async function testGateway(companyId: number): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const g = await activeGateway(companyId);
  if (!g) return { ok: false, error: "Online payments are switched off. Save a gateway first." };
  if (g.driver === "demo") return { ok: true, message: "The demo gateway is active. Customers can test paying without real money." };
  try {
    const r = await checkStripeKey(g.secrets.secretKey);
    return { ok: true, message: `Connected to Stripe in ${r.livemode ? "live" : "test"} mode.` };
  } catch (e) {
    return { ok: false, error: e instanceof StripeError ? e.message : "Could not reach Stripe." };
  }
}

/** Outstanding balance a portal customer can pay now on this invoice (0 when not payable). */
export async function payableAmount(companyId: number, customerId: number, invoiceId: number): Promise<number> {
  const open = (await openInvoices(companyId, customerId)).find((i) => i.id === invoiceId);
  return open ? Math.max(0, open.available) : 0;
}

/** The portal customer fields checkout needs (portal sessions omit secrets such as the password hash). */
type PortalCustomer = Pick<Customer, "id" | "companyId" | "email">;

/** Starts a checkout for the invoice's full outstanding balance and returns where to send the customer. */
export async function startCheckout(slug: string, customer: PortalCustomer, invoiceId: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const g = await activeGateway(customer.companyId);
  if (!g) return { ok: false, error: "Online payments are not available." };
  const inv = await db.invoice.findFirst({ where: { id: invoiceId, customerId: customer.id, companyId: customer.companyId, type: "INVOICE", status: { not: "DRAFT" } } });
  if (!inv) return { ok: false, error: "Invoice not found." };
  const amount = await payableAmount(customer.companyId, customer.id, inv.id);
  if (amount < 1) return { ok: false, error: "This invoice has nothing left to pay." };

  if (g.driver === "demo") {
    const ref = `demo_${randomToken(16)}`;
    await db.onlinePayment.create({ data: { companyId: customer.companyId, customerId: customer.id, invoiceId: inv.id, driver: "demo", providerRef: ref, amount, currency: inv.currency } });
    return { ok: true, url: `/portal/${slug}/pay/${ref}` };
  }

  const op = await db.onlinePayment.create({ data: { companyId: customer.companyId, customerId: customer.id, invoiceId: inv.id, driver: "stripe", providerRef: `pending_${randomToken(16)}`, amount, currency: inv.currency } });
  const company = await db.company.findUniqueOrThrow({ where: { id: customer.companyId } });
  const page = `${await getBaseUrl()}/portal/${slug}/invoices/${inv.id}`;
  try {
    const session = await createCheckoutSession(g.secrets.secretKey, {
      amount,
      currency: inv.currency,
      name: `Invoice ${inv.invoiceNumber}`,
      description: company.name,
      email: customer.email,
      successUrl: `${page}?checkout={CHECKOUT_SESSION_ID}`,
      cancelUrl: page,
      metadata: { onlinePaymentId: String(op.id), invoiceId: String(inv.id), companyId: String(company.id) },
      idempotencyKey: `kydi-online-payment-${op.id}`,
    });
    if (!session.url) throw new StripeError("Stripe did not return a checkout page.");
    await db.onlinePayment.update({ where: { id: op.id }, data: { providerRef: session.id } });
    return { ok: true, url: session.url };
  } catch (e) {
    await db.onlinePayment.delete({ where: { id: op.id } });
    console.error("[kydi] stripe checkout failed", e);
    return { ok: false, error: e instanceof StripeError ? `Payment could not be started: ${e.message}` : "Payment could not be started. Please try again." };
  }
}

/** "error" means Stripe could not be asked (network/API failure); the webhook answers 500 so Stripe retries. */
export type CheckoutOutcome = "paid" | "pending" | "expired" | "invalid" | "error";

/** Confirms a Stripe Checkout session against Stripe itself (never trusts the redirect alone). */
export async function confirmStripeSession(companyId: number, sessionId: string): Promise<CheckoutOutcome> {
  const op = await db.onlinePayment.findUnique({ where: { providerRef: sessionId } });
  if (!op || op.companyId !== companyId || op.driver !== "stripe") return "invalid";
  if (op.status === "PAID") return "paid";
  const g = await activeGateway(companyId);
  if (!g || g.driver !== "stripe") return "invalid";
  let s;
  try {
    s = await retrieveCheckoutSession(g.secrets.secretKey, sessionId);
  } catch (e) {
    console.error("[kydi] stripe session lookup failed", e);
    return "error";
  }
  if (s.status === "expired") {
    await db.onlinePayment.updateMany({ where: { id: op.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    return "expired";
  }
  const matches = s.metadata?.onlinePaymentId === String(op.id) && s.currency?.toUpperCase() === op.currency.toUpperCase() && s.amount_total === toStripeAmount(Number(op.amount), op.currency);
  if (s.payment_status !== "paid") return "pending";
  if (!matches) {
    console.error("[kydi] stripe session does not match its online payment", { sessionId, onlinePaymentId: op.id });
    return "invalid";
  }
  await complete(op.id);
  return "paid";
}

/** Completes a demo checkout for the signed-in customer. */
export async function completeDemoCheckout(customer: PortalCustomer, ref: string): Promise<{ ok: true; invoiceId: number } | { ok: false; error: string }> {
  const op = await db.onlinePayment.findUnique({ where: { providerRef: ref } });
  if (!op || op.customerId !== customer.id || op.driver !== "demo") return { ok: false, error: "Payment not found." };
  if (op.status === "PAID") return { ok: true, invoiceId: op.invoiceId };
  if (op.status !== "PENDING") return { ok: false, error: "This payment link has expired." };
  const g = await activeGateway(op.companyId);
  if (!g || g.driver !== "demo") return { ok: false, error: "Demo payments are switched off." };
  await complete(op.id);
  return { ok: true, invoiceId: op.invoiceId };
}

export async function expireCheckout(companyId: number, sessionId: string) {
  await db.onlinePayment.updateMany({ where: { providerRef: sessionId, companyId, status: "PENDING" }, data: { status: "EXPIRED" } });
}

async function complete(onlinePaymentId: number) {
  const r = await recordOnlinePayment(onlinePaymentId);
  if (r.created) await notifyPaid(r.paymentId).catch((e) => console.error("[kydi] payment notification failed", e));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Emails the company's notification address that a customer paid online. */
async function notifyPaid(paymentId: number) {
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { customer: true, onlinePayment: { include: { invoice: true } } } });
  const s = await getCompanySettings(p.companyId);
  if (!s.notification_email) return;
  const inv = p.onlinePayment?.invoice;
  await sendCompanyMail(p.companyId, {
    to: s.notification_email,
    subject: `${p.customer.name} paid ${inv ? `invoice ${inv.invoiceNumber}` : "online"}`,
    html: `<p>${esc(p.customer.name)} paid <strong>${esc(formatMoney(p.amount, p.currency, s.locale))}</strong>${inv ? ` for invoice <strong>${esc(inv.invoiceNumber)}</strong>` : ""} through the customer portal.</p><p><a href="${await getBaseUrl()}/payments/${p.id}">Open payment ${esc(p.paymentNumber)}</a></p><p>— Kydi</p>`,
  });
}
