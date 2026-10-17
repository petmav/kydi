import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formEncode, stripeKeyMode, toStripeAmount, verifyStripeSignature } from "./stripe";

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
