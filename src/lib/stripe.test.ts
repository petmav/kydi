import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebhookEndpoint, deleteWebhookEndpoint, formEncode, isPermissionError, STRIPE_API_VERSION, StripeError, stripeKeyMode, toStripeAmount, verifyStripeSignature, WEBHOOK_EVENTS, webhookUrlProblem } from "./stripe";

const secret = "whsec_test";
const sign = (body: string, t: number, key = secret) => `t=${t},v1=${createHmac("sha256", key).update(`${t}.${body}`).digest("hex")}`;

describe("verifyStripeSignature", () => {
  const body = '{"id":"evt_1","type":"checkout.session.completed"}';
  const t = 1_760_000_000;
  const now = t * 1000;

  it("accepts a valid signature", () => {
    expect(verifyStripeSignature(body, sign(body, t), secret, 300, now)).toBe(true);
  });

  it("accepts when any of several v1 signatures matches (secret rotation)", () => {
    const header = `t=${t},v1=${"0".repeat(64)},${sign(body, t).split(",")[1]}`;
    expect(verifyStripeSignature(body, header, secret, 300, now)).toBe(true);
  });

  it("rejects a tampered body, wrong secret, missing header and old timestamp", () => {
    expect(verifyStripeSignature(body.replace("evt_1", "evt_2"), sign(body, t), secret, 300, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, t, "whsec_other"), secret, 300, now)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, 300, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t}`, secret, 300, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, t), secret, 300, now + 301_000)).toBe(false);
  });
});

describe("toStripeAmount", () => {
  it("passes two-decimal currencies through", () => {
    expect(toStripeAmount(123_45, "USD")).toBe(123_45);
    expect(toStripeAmount(100, "eur")).toBe(100);
  });

  it("converts zero- and three-decimal currencies", () => {
    expect(toStripeAmount(5000_00, "JPY")).toBe(5000);
    expect(toStripeAmount(12_50, "KWD")).toBe(12_500);
  });
});

describe("formEncode", () => {
  it("flattens nested objects and arrays like Stripe expects", () => {
    const out = formEncode({ mode: "payment", metadata: { a: "1" }, line_items: [{ quantity: 1, price_data: { currency: "usd" } }], skip: undefined });
    expect(out.map(decodeURIComponent)).toEqual(["mode=payment", "metadata[a]=1", "line_items[0][quantity]=1", "line_items[0][price_data][currency]=usd"]);
  });
});

describe("stripeKeyMode", () => {
  it("reads test/live from secret and restricted key prefixes", () => {
    expect(stripeKeyMode("rk_test_abc")).toBe("test");
    expect(stripeKeyMode("sk_live_abc")).toBe("live");
    expect(stripeKeyMode("pk_live_abc")).toBeNull();
    expect(stripeKeyMode(undefined)).toBeNull();
  });
});

describe("webhookUrlProblem", () => {
  it("accepts public https only", () => {
    expect(webhookUrlProblem("https://kydi.example.org/api/payments/stripe/1")).toBeNull();
    expect(webhookUrlProblem("http://kydi.example.org/api/payments/stripe/1")).toMatch(/https/);
    expect(webhookUrlProblem("https://localhost:3000/api/payments/stripe/1")).toMatch(/private or local/);
    expect(webhookUrlProblem("https://192.168.1.20/api/payments/stripe/1")).toMatch(/private or local/);
  });
});

describe("webhook endpoint registration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("registers Kydi's events on the pinned API version and returns the signing secret", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "we_123", secret: "whsec_abc" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const ep = await createWebhookEndpoint("rk_test_x", { url: "https://kydi.example.org/api/payments/stripe/1", description: "Kydi", metadata: { kydi_company_id: "1" } });
    expect(ep).toEqual({ id: "we_123", secret: "whsec_abc" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/webhook_endpoints");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer rk_test_x");
    const body = decodeURIComponent(String(init.body));
    expect(body).toContain("url=https://kydi.example.org/api/payments/stripe/1");
    expect(body).toContain(`api_version=${STRIPE_API_VERSION}`);
    for (const ev of WEBHOOK_EVENTS) expect(body).toContain(`=${ev}`);
  });

  it("reports missing permissions as such", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "The provided key does not have the required permissions for this endpoint." } }), { status: 403 })));
    const err = await createWebhookEndpoint("rk_test_x", { url: "https://kydi.example.org/x", description: "Kydi", metadata: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(StripeError);
    expect(isPermissionError(err)).toBe(true);
  });

  it("deletes by id and ignores malformed ids", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "we_123", deleted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await deleteWebhookEndpoint("rk_test_x", "we_123");
    await deleteWebhookEndpoint("rk_test_x", "../../charges");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.stripe.com/v1/webhook_endpoints/we_123");
  });
});
