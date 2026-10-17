import type { Customer } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/secrets";
import { randomToken } from "@/lib/auth/tokens";
import { getCompanySettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { getBaseUrl } from "@/lib/url";
import { env } from "@/lib/env";
import { checkStripeKey, createCheckoutSession, createWebhookEndpoint, deleteWebhookEndpoint, isPermissionError, retrieveCheckoutSession, StripeError, stripeKeyMode, toStripeAmount, webhookUrlProblem } from "@/lib/stripe";
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
export type GatewayView = {
  enabled: boolean;
  driver: GatewayDriver;
  secretsSet: string[];
  mode: "test" | "live" | null;
  demoAllowed: boolean;
  /** "auto": Kydi registered the webhook in Stripe; "manual": a signing secret was pasted (e.g. stripe listen). */
  webhook: "auto" | "manual" | null;
};

/** Non-secret Stripe settings kept in PaymentGateway.options. */
type StripeOptions = { webhookEndpointId?: string };

export async function stripeWebhookUrl(companyId: number): Promise<string> {
  return `${await getBaseUrl()}/api/payments/stripe/${companyId}`;
}

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
  if (!r || !isDriver(r.driver)) return { enabled: false, driver: demoAllowed ? "demo" : "stripe", secretsSet: [], mode: null, demoAllowed, webhook: null };
  const secrets = decryptJson(r.secrets);
  const stripe = r.driver === "stripe";
  const webhook = !stripe || !secrets.webhookSecret ? null : (r.options as StripeOptions).webhookEndpointId ? "auto" : "manual";
  return { enabled: r.enabled, driver: r.driver, secretsSet: Object.keys(secrets), mode: stripe ? stripeKeyMode(secrets.secretKey) : null, demoAllowed, webhook };
}

type SaveResult = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Best effort: a webhook left behind in Stripe only produces failed deliveries, never wrong payments. */
async function removeWebhook(secretKey: string | undefined, endpointId: string | undefined) {
  if (!secretKey || !endpointId) return;
  await deleteWebhookEndpoint(secretKey, endpointId).catch((e) => console.error("[kydi] could not remove Stripe webhook", e));
}

/**
 * Saves the gateway. For Stripe the owner pastes one restricted key: Kydi checks it, registers its own webhook in
 * the owner's Stripe account and keeps the signing secret. A pasted signing secret (Advanced) is used instead when
 * Stripe cannot reach this install, e.g. local testing with `stripe listen`.
 */
export async function saveGateway(companyId: number, form: Record<string, unknown>): Promise<SaveResult> {
  const existing = await gatewayRow(companyId);
  if (!["on", "true", "1"].includes(String(form.enabled ?? ""))) {
    if (existing) await db.paymentGateway.update({ where: { id: existing.id }, data: { enabled: false } });
    return { ok: true };
  }
  if (!isDriver(form.driver)) return { ok: false, error: "Choose a gateway.", fieldErrors: { driver: ["Choose a gateway."] } };
  const driver = form.driver;
  if (driver === "demo" && !demoGatewayAllowed()) return { ok: false, error: "The demo gateway is not available on a production install.", fieldErrors: { driver: ["Choose Stripe Checkout."] } };
  const keep = existing?.driver === "stripe" ? decryptJson(existing.secrets) : {};
  const keptOptions = (existing?.driver === "stripe" ? existing.options : {}) as StripeOptions;

  if (driver === "demo") {
    await removeWebhook(keep.secretKey, keptOptions.webhookEndpointId);
    const data = { enabled: true, driver, options: {}, secrets: null };
    if (existing) await db.paymentGateway.update({ where: { id: existing.id }, data });
    else await db.paymentGateway.create({ data: { ...data, companyId } });
    return { ok: true };
  }

  // Stripe: a blank key input keeps the stored key.
  const typedKey = String(form.secretKey ?? "").trim();
  const secretKey = typedKey || keep.secretKey || "";
  if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(secretKey)) {
    return { ok: false, error: "Paste your Stripe restricted key.", fieldErrors: { secretKey: ["Paste a restricted key (rk_test_… or rk_live_…)."] } };
  }
  const keyChanged = !!typedKey && typedKey !== keep.secretKey;
  if (keyChanged) {
    try {
      await checkStripeKey(secretKey);
    } catch (e) {
      const msg = isPermissionError(e) ? "This key cannot read your balance: give it Balance: Read." : e instanceof StripeError ? e.message : "Could not reach Stripe.";
      return { ok: false, error: msg, fieldErrors: { secretKey: [msg] } };
    }
  }

  const manualSecret = String(form.webhookSecret ?? "").trim();
  let webhookSecret = keep.webhookSecret ?? "";
  let webhookEndpointId = keptOptions.webhookEndpointId;
  let message: string | undefined;
  if (manualSecret) {
    if (!/^whsec_[A-Za-z0-9]+$/.test(manualSecret)) return { ok: false, error: "Webhook signing secrets start with whsec_.", fieldErrors: { webhookSecret: ["Webhook signing secrets start with whsec_."] } };
    await removeWebhook(keep.secretKey, webhookEndpointId);
    webhookSecret = manualSecret;
    webhookEndpointId = undefined;
  } else if (keyChanged || !webhookSecret) {
    const url = await stripeWebhookUrl(companyId);
    const problem = webhookUrlProblem(url);
    if (problem) {
      const msg = `${problem} Set APP_URL to this install's public https address, or for local testing paste the signing secret from \`stripe listen\` under Advanced.`;
      return { ok: false, error: msg, fieldErrors: { secretKey: [msg] } };
    }
    try {
      const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } });
      const ep = await createWebhookEndpoint(secretKey, { url, description: `Kydi online payments (${company.name})`, metadata: { kydi_company_id: String(companyId) } });
      // Replace, never leave a gap: the new endpoint exists before the old one is removed.
      await removeWebhook(keep.secretKey, webhookEndpointId);
      webhookSecret = ep.secret;
      webhookEndpointId = ep.id;
      message = "Stripe connected. Kydi registered its webhook in your Stripe account.";
    } catch (e) {
      const msg = isPermissionError(e)
        ? "This key cannot create webhooks: in Stripe, edit the key and set “Webhook Endpoints, Event Destinations” to Write, then save again."
        : `Stripe did not accept the webhook: ${e instanceof StripeError ? e.message : "could not reach Stripe"}.`;
      return { ok: false, error: msg, fieldErrors: { secretKey: [msg] } };
    }
  }

  const data = { enabled: true, driver, options: webhookEndpointId ? { webhookEndpointId } : {}, secrets: encryptJson({ secretKey, webhookSecret }) };
  if (existing) await db.paymentGateway.update({ where: { id: existing.id }, data });
  else await db.paymentGateway.create({ data: { ...data, companyId } });
  return { ok: true, message };
}

/** Forgets the Stripe key and removes the webhook Kydi registered. Online payments switch off. */
export async function disconnectGateway(companyId: number): Promise<void> {
  const existing = await gatewayRow(companyId);
  if (!existing) return;
  if (existing.driver === "stripe") await removeWebhook(decryptJson(existing.secrets).secretKey, (existing.options as StripeOptions).webhookEndpointId);
  await db.paymentGateway.update({ where: { id: existing.id }, data: { enabled: false, options: {}, secrets: null } });
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
