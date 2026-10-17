import { describe, expect, it } from "vitest";
import { generateLoginCode, hashLoginCode, loginCodeMatches, loginHint, normalizeLoginCode, readLoginHint } from "./login-code";

describe("login codes", () => {
  it("generates 6-digit codes", () => {
    for (let i = 0; i < 50; i++) expect(generateLoginCode()).toMatch(/^\d{6}$/);
  });

  it("matches only the same code for the same customer", () => {
    const h = hashLoginCode(7, "042913");
    expect(loginCodeMatches(7, "042913", h)).toBe(true);
    expect(loginCodeMatches(7, "042914", h)).toBe(false);
    expect(loginCodeMatches(8, "042913", h)).toBe(false);
  });

  it("normalizes typed codes", () => {
    expect(normalizeLoginCode("123 456")).toBe("123456");
    expect(normalizeLoginCode("123-456")).toBe("123456");
    expect(normalizeLoginCode("12345")).toBeNull();
    expect(normalizeLoginCode("abcdef")).toBeNull();
  });
});

describe("login hints", () => {
  it("round-trips a customer id and rejects tampering", () => {
    const h = loginHint(42);
    expect(readLoginHint(h)).toBe(42);
    expect(readLoginHint(h.replace(/^c42/, "c43"))).toBeNull();
    expect(readLoginHint("c42")).toBeNull();
    expect(readLoginHint(undefined)).toBeNull();
  });
});
