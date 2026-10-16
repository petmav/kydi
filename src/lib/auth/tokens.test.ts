import { describe, expect, it } from "vitest";
import { signValue, unsignValue, sha256, randomToken } from "./tokens";
import { hashPassword, verifyPassword } from "./password";

describe("signed tokens", () => {
  it("round-trips a signed value", () => {
    const t = randomToken();
    expect(unsignValue(signValue(t))).toBe(t);
  });
  it("rejects tampered values", () => {
    const signed = signValue("abc");
    expect(unsignValue(signed.replace("abc", "abd"))).toBeNull();
    expect(unsignValue("nodot")).toBeNull();
    expect(unsignValue(undefined)).toBeNull();
  });
  it("hashes deterministically", () => {
    expect(sha256("x")).toBe(sha256("x"));
    expect(sha256("x")).not.toBe(sha256("y"));
  });
});

describe("argon2id passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });
});
