import { createHmac, timingSafeEqual } from "node:crypto";
import { isPublicHttpUrl } from "@/lib/net";

/** Minimal Stripe Checkout client over the REST API (no Stripe SDK dependency). */

const API = "https://api.stripe.com/v1";
/** Pinned so Dashboard API upgrades cannot change request/response shapes under us. */
export const STRIPE_API_VERSION = "2026-08-26.dahlia";
/** Tags Kydi portal checkouts in the Stripe Dashboard (label + 8 random letters, per Stripe guidance). */
export const INTEGRATION_IDENTIFIER = "kydi-portal-invoice-qhzmtvra";

/** Stripe's zero-decimal currencies: amounts are whole units, not cents. */
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
/** Three-decimal currencies: Stripe expects thousandths with the last digit 0. */
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

/** Kydi stores every currency as amount x 100 (spec §3.0); converts to Stripe's smallest unit. */
export function toStripeAmount(minor: number, currency: string): number {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return Math.round(minor / 100);
  if (THREE_DECIMAL.has(c)) return minor * 10;
  return minor;
}

/**
 * Verifies a `Stripe-Signature` header (`t=<unix>,v1=<hex>[,v1=...]`): HMAC-SHA256 of `${t}.${rawBody}` with
 * the endpoint's signing secret, and a timestamp within `toleranceSec` of `now`.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300, now = Date.now()): boolean {
  if (!header || !secret) return false;
  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s?.trim());
    if (k === "t" && v && /^\d+$/.test(v)) t = Number(v);
    else if (k === "v1" && v) sigs.push(v);
  }
  if (t === null || !sigs.length) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex"));
  return sigs.some((s) => {
    const got = Buffer.from(s);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/** Flattens nested params into Stripe's form encoding: a[b][0][c]=v. */
export function formEncode(params: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => out.push(...(typeof item === "object" ? formEncode(item as Record<string, unknown>, `${key}[${i}]`) : [`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`])));
    else if (typeof v === "object") out.push(...formEncode(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export class StripeError extends Error {}

async function call<T>(secretKey: string, method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}`, "Stripe-Version": STRIPE_API_VERSION };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { method, headers, body: params ? formEncode(params).join("&") : undefined, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    throw new StripeError("Could not reach Stripe. Please try again.");
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new StripeError(json.error?.message ?? `Stripe returned HTTP ${res.status}.`);
  return json;
}

export type CheckoutSession = {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  payment_intent: string | null;
  metadata: Record<string, string>;
};

export function createCheckoutSession(
  secretKey: string,
  p: { amount: number; currency: string; name: string; description?: string; email?: string | null; successUrl: string; cancelUrl: string; metadata: Record<string, string>; idempotencyKey: string },
): Promise<CheckoutSession> {
  return call<CheckoutSession>(
    secretKey,
    "POST",
    "/checkout/sessions",
    {
      mode: "payment",
      integration_identifier: INTEGRATION_IDENTIFIER,
      // Short-lived so an abandoned checkout cannot be paid long after the invoice changed (min 30 min).
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      success_url: p.successUrl,
      cancel_url: p.cancelUrl,
      customer_email: p.email || undefined,
      client_reference_id: p.metadata.onlinePaymentId,
      metadata: p.metadata,
      payment_intent_data: { metadata: p.metadata },
      line_items: [{ quantity: 1, price_data: { currency: p.currency.toLowerCase(), unit_amount: toStripeAmount(p.amount, p.currency), product_data: { name: p.name, description: p.description } } }],
    },
    p.idempotencyKey,
  );
}

export function retrieveCheckoutSession(secretKey: string, id: string): Promise<CheckoutSession> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return Promise.reject(new StripeError("Invalid checkout session."));
  return call<CheckoutSession>(secretKey, "GET", `/checkout/sessions/${id}`);
}

/** "test" or "live" from the key prefix (sk_/rk_). */
export function stripeKeyMode(key: string | undefined): "test" | "live" | null {
  const m = /^(?:sk|rk)_(test|live)_/.exec(key ?? "");
  return m ? (m[1] as "test" | "live") : null;
}

/** Cheap authenticated call used by "Test connection". */
export async function checkStripeKey(secretKey: string): Promise<{ livemode: boolean }> {
  const r = await call<{ livemode: boolean }>(secretKey, "GET", "/balance");
  return { livemode: !!r.livemode };
}

/** Events Kydi's webhook handler acts on (src/app/api/payments/stripe/[companyId]/route.ts). */
export const WEBHOOK_EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"] as const;

/** Why Stripe could not deliver to this webhook URL, or null when it can (public https only). */
export function webhookUrlProblem(url: string): string | null {
  if (!url.startsWith("https://")) return "Stripe only delivers webhooks to https addresses.";
  if (!isPublicHttpUrl(url)) return "Stripe cannot reach a private or local address.";
  return null;
}

export type WebhookEndpoint = { id: string; secret: string };

/** Registers Kydi's webhook in the owner's Stripe account; the signing secret is only returned here. */
export async function createWebhookEndpoint(secretKey: string, p: { url: string; description: string; metadata: Record<string, string> }): Promise<WebhookEndpoint> {
  const r = await call<{ id: string; secret?: string }>(secretKey, "POST", "/webhook_endpoints", {
    url: p.url,
    enabled_events: [...WEBHOOK_EVENTS],
    api_version: STRIPE_API_VERSION,
    description: p.description,
    metadata: p.metadata,
  });
  if (!r.secret) throw new StripeError("Stripe did not return a webhook signing secret.");
  return { id: r.id, secret: r.secret };
}

export async function deleteWebhookEndpoint(secretKey: string, id: string): Promise<void> {
  if (!/^we_[A-Za-z0-9]+$/.test(id)) return;
  await call(secretKey, "DELETE", `/webhook_endpoints/${id}`);
}

/** Stripe's "missing permission" errors, so the UI can point at the restricted key settings. */
export function isPermissionError(e: unknown): boolean {
  return e instanceof StripeError && /permission/i.test(e.message);
}
