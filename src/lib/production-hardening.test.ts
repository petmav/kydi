import { describe, expect, it } from "vitest";
import { checkProductionConfig } from "@/lib/config-check";
import { decryptSecret, encryptSecret, encryptSecretLegacy, isLegacySecret, reencryptLegacy } from "@/lib/secrets";
import { checkPasswordPolicy } from "@/lib/auth/password-policy";
import { isPrivateAddress, isPublicHostname } from "@/lib/net";
import { BlockedDestinationError, guardedLookup, resolvePublicAddresses, safeRequest } from "@/lib/safe-fetch";
import { redact, secretValuesFromEnv } from "@/lib/log";
import { clientIpFrom, isSameOriginRequest } from "@/lib/request-meta";
import { cronAuthorized } from "@/lib/cron-auth";
import { buildCsp } from "@/lib/csp";
import { contentDisposition, sniffReceipt } from "@/lib/storage";
import { generateInstallToken, installTokenHash, normalizeInstallToken, resolveInstallPolicy, sameDigest } from "@/server/install";
import { demoSeedAllowed } from "@/server/seed";
import { ARGON2_OPTIONS, hashPassword, verifyPassword, verifyPasswordOrDummy } from "@/lib/auth/password";

const strong = (seed: string) => `${seed}-7f3c9a1e5b2d4f60a8b7c6d5e4f3a2b1`;
const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

describe("production configuration guard", () => {
  const base = { DATABASE_URL: "postgresql://u:p@db:5432/kydi", SESSION_SECRET: strong("session"), APP_ENCRYPTION_KEY: strong("encrypt"), APP_URL: "https://kydi.example.org" };

  it("accepts a complete, random configuration", () => {
    expect(checkProductionConfig(base).errors).toEqual([]);
  });

  it("refuses a missing, short or known SESSION_SECRET", () => {
    expect(checkProductionConfig({ ...base, SESSION_SECRET: undefined }).errors.join()).toMatch(/SESSION_SECRET is not set/);
    expect(checkProductionConfig({ ...base, SESSION_SECRET: "x".repeat(20) }).errors.join()).toMatch(/too short/);
    for (const known of ["dev-only-session-secret-please-change-0123456789", "kydi-insecure-development-encryption-key", "a".repeat(40)]) {
      expect(checkProductionConfig({ ...base, SESSION_SECRET: known }).errors.join(), known).toMatch(/SESSION_SECRET/);
    }
  });

  it("requires a separate APP_ENCRYPTION_KEY and a strong CRON_SECRET when set", () => {
    expect(checkProductionConfig({ ...base, APP_ENCRYPTION_KEY: undefined }).errors.join()).toMatch(/APP_ENCRYPTION_KEY is not set/);
    expect(checkProductionConfig({ ...base, APP_ENCRYPTION_KEY: base.SESSION_SECRET }).errors.join()).toMatch(/must differ/);
    expect(checkProductionConfig({ ...base, CRON_SECRET: "dev-cron-secret" }).errors.join()).toMatch(/CRON_SECRET/);
    expect(checkProductionConfig({ ...base, CRON_SECRET: strong("cron") }).errors).toEqual([]);
  });

  it("warns about demo data and a missing APP_URL", () => {
    const r = checkProductionConfig({ ...base, APP_URL: undefined, KYDI_DEMO_SEED: "true" });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/KYDI_DEMO_SEED/);
    expect(r.warnings.join()).toMatch(/APP_URL/);
  });
});

describe("credential encryption with APP_ENCRYPTION_KEY", () => {
  const key = strong("key");
  const oldSession = strong("old-session");

  it("writes v2 values that do not depend on SESSION_SECRET", () => {
    const enc = encryptSecret("smtp-pass", key);
    expect(enc.startsWith("v2:")).toBe(true);
    expect(decryptSecret(enc, key, [strong("rotated-session")])).toBe("smtp-pass");
    expect(decryptSecret(enc, strong("other-key"))).toBeNull();
  });

  it("migrates legacy v1 values (SESSION_SECRET-derived) to v2", () => {
    const legacy = encryptSecretLegacy("mailgun-key", oldSession);
    expect(isLegacySecret(legacy)).toBe(true);
    expect(decryptSecret(legacy, key, [oldSession])).toBe("mailgun-key");
    const migrated = reencryptLegacy(legacy, key, [oldSession]);
    expect(migrated && migrated.startsWith("v2:")).toBe(true);
    // After migration, rotating SESSION_SECRET no longer matters.
    expect(decryptSecret(migrated, key, [strong("brand-new-session")])).toBe("mailgun-key");
  });

  it("tries every legacy secret and reports unreadable values", () => {
    const legacy = encryptSecretLegacy("token", oldSession);
    expect(reencryptLegacy(legacy, key, [strong("current"), oldSession])?.startsWith("v2:")).toBe(true);
    expect(reencryptLegacy(legacy, key, [strong("unrelated")])).toBeNull();
    const v2 = encryptSecret("x", key);
    expect(reencryptLegacy(v2, key, [oldSession])).toBe(v2);
    expect(reencryptLegacy(null, key, [oldSession])).toBeNull();
  });
});

describe("install protection", () => {
  it("binds to the owner email when set and requires a token otherwise in production", () => {
    expect(resolveInstallPolicy({ production: true, ownerEmail: "Owner@Example.org" })).toEqual({ ownerEmail: "owner@example.org", requireToken: false });
    expect(resolveInstallPolicy({ production: true, ownerEmail: "" })).toEqual({ ownerEmail: null, requireToken: true });
    expect(resolveInstallPolicy({ production: true, ownerEmail: "o@example.org", requireToken: true })).toEqual({ ownerEmail: "o@example.org", requireToken: true });
    expect(resolveInstallPolicy({ production: false })).toEqual({ ownerEmail: null, requireToken: false });
  });

  it("generates readable high-entropy tokens and compares hashes in constant time", () => {
    const t = generateInstallToken();
    expect(t).toMatch(/^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/);
    expect(new Set(Array.from({ length: 50 }, generateInstallToken)).size).toBe(50);
    expect(normalizeInstallToken(` ${t.toLowerCase().replace(/-/g, " ")} `)).toBe(t.replace(/-/g, ""));
    expect(sameDigest(installTokenHash(t), installTokenHash(t.toLowerCase()))).toBe(true);
    expect(sameDigest(installTokenHash(t), installTokenHash(generateInstallToken()))).toBe(false);
    expect(sameDigest(installTokenHash(t), "")).toBe(false);
  });
});

describe("demo seed gate", () => {
  it("refuses production unless KYDI_DEMO_SEED=true", () => {
    expect(demoSeedAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(demoSeedAllowed({ NODE_ENV: "production", KYDI_DEMO_SEED: "false" })).toBe(false);
    expect(demoSeedAllowed({ NODE_ENV: "production", KYDI_DEMO_SEED: "true" })).toBe(true);
    expect(demoSeedAllowed({ NODE_ENV: "development" })).toBe(true);
  });
});

describe("password policy and hashing", () => {
  it("enforces length and rejects common or personal passwords", () => {
    expect(checkPasswordPolicy("short")).toMatch(/10 characters/);
    expect(checkPasswordPolicy("password123")).toMatch(/too common/);
    expect(checkPasswordPolicy("zzzzzzzzzzzz")).toMatch(/too common/);
    expect(checkPasswordPolicy("jane.doe.mail", { email: "jane.doe.mail@example.org" })).toMatch(/email/);
    expect(checkPasswordPolicy("correct horse battery staple")).toBeNull();
  });

  it("uses Argon2id and spends the same work for unknown accounts", async () => {
    expect(ARGON2_OPTIONS.algorithm).toBe(2);
    const h = await hashPassword("a sufficiently long passphrase");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "a sufficiently long passphrase")).toBe(true);
    expect(await verifyPasswordOrDummy(null, "anything at all")).toBe(false);
    expect(await verifyPasswordOrDummy(h, "a sufficiently long passphrase")).toBe(true);
  });
});

describe("SSRF guard", () => {
  it("classifies private, mapped and translated addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "2002:7f00:1::1", "ff02::1", "not-an-ip"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("refuses single-label Compose service names and internal suffixes", () => {
    for (const h of ["db", "app", "localhost", "db.internal", "printer.local", "x.test"]) expect(isPublicHostname(h), h).toBe(false);
  });

  it("rejects private destinations before connecting (IP literals and names)", async () => {
    await expect(resolvePublicAddresses("127.0.0.1")).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(resolvePublicAddresses("[::1]")).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(resolvePublicAddresses("db")).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(resolvePublicAddresses("localhost")).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(resolvePublicAddresses("8.8.8.8")).resolves.toEqual([{ address: "8.8.8.8", family: 4 }]);
  });

  it("blocks at connect time through the socket lookup hook", async () => {
    const err = await new Promise<Error | null>((resolve) => guardedLookup("localhost", { all: true }, (e) => resolve(e)));
    expect(err).toBeInstanceOf(BlockedDestinationError);
    await expect(safeRequest("http://127.0.0.1:9/")).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(safeRequest("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(safeRequest("file:///etc/passwd")).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(safeRequest("http://user:pw@8.8.8.8/")).rejects.toBeInstanceOf(BlockedDestinationError);
  });
});

describe("log redaction", () => {
  it("removes configured secrets, tokens and credential pairs", () => {
    const env = { SESSION_SECRET: strong("s"), DATABASE_URL: "postgresql://kydi:p%40ss-word-123@db:5432/kydi" };
    const secrets = secretValuesFromEnv(env);
    const out = redact(
      `boot ${env.SESSION_SECRET} url ${env.DATABASE_URL} Authorization: Bearer abcdefghijklmnop1234 token kyd_abc12345_${"x".repeat(40)} { password: 'hunter2hunter2', apiKey: "k-123456" }`,
      secrets,
    );
    expect(out).not.toContain(env.SESSION_SECRET);
    expect(out).not.toContain("p%40ss-word-123");
    expect(out).not.toContain("abcdefghijklmnop1234");
    expect(out).not.toContain("x".repeat(40));
    expect(out).not.toContain("hunter2hunter2");
    expect(out).not.toContain("k-123456");
    expect(out).toContain("boot [redacted]");
  });
});

describe("request metadata", () => {
  it("takes the client IP from the trusted proxy hop, not client-supplied entries", () => {
    expect(clientIpFrom(headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), 1)).toBe("203.0.113.9");
    expect(clientIpFrom(headers({ "x-forwarded-for": "6.6.6.6, 198.51.100.1, 10.0.0.2" }), 2)).toBe("198.51.100.1");
    expect(clientIpFrom(headers({ "x-forwarded-for": "6.6.6.6" }), 0)).toBe("unknown");
    expect(clientIpFrom(headers({}), 1)).toBe("unknown");
  });

  it("accepts only same-origin cookie writes", () => {
    expect(isSameOriginRequest(headers({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(headers({ "sec-fetch-site": "same-site", origin: "https://evil.example.org" }))).toBe(false);
    expect(isSameOriginRequest(headers({ origin: "https://kydi.example.org", host: "kydi.example.org" }))).toBe(true);
    expect(isSameOriginRequest(headers({ origin: "https://evil.example.org", host: "kydi.example.org" }))).toBe(false);
    expect(isSameOriginRequest(headers({ host: "kydi.example.org" }))).toBe(false);
  });
});

describe("cron secret", () => {
  it("compares in constant time and refuses when unset", () => {
    const s = strong("cron");
    expect(cronAuthorized(`Bearer ${s}`, s)).toBe(true);
    expect(cronAuthorized(`Bearer ${s}x`, s)).toBe(false);
    expect(cronAuthorized("Bearer ", s)).toBe(false);
    expect(cronAuthorized(null, s)).toBe(false);
    expect(cronAuthorized(`Bearer ${s}`, undefined)).toBe(false);
  });
});

describe("content security policy", () => {
  it("uses a nonce with strict-dynamic, forbids framing and only upgrades over https", () => {
    const p = buildCsp({ nonce: "abc", dev: false, https: true, frameAncestors: "'none'" });
    expect(p).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(p).not.toContain("unsafe-eval");
    expect(p).toContain("frame-ancestors 'none'");
    expect(p).toContain("object-src 'none'");
    expect(p).toContain("upgrade-insecure-requests");
    expect(buildCsp({ nonce: "abc", dev: false, https: false, frameAncestors: "'self'" })).not.toContain("upgrade-insecure-requests");
  });
});

describe("upload validation", () => {
  it("accepts receipts only when the content matches the type", () => {
    expect(sniffReceipt(Buffer.from("%PDF-1.7 ..."), "pdf")).toBe("pdf");
    expect(sniffReceipt(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "jpg")).toBe("png");
    expect(sniffReceipt(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), "xlsx")).toBe("xlsx");
    expect(sniffReceipt(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), "pdf")).toBeNull();
    expect(sniffReceipt(Buffer.from("<html><script>alert(1)</script>"), "pdf")).toBeNull();
    expect(sniffReceipt(Buffer.from("<svg onload=alert(1)>"), "png")).toBeNull();
  });

  it("builds safe Content-Disposition headers", () => {
    const v = contentDisposition("attachment", 'in"voice\r\n../ü.pdf');
    expect(v).not.toMatch(/[\r\n]/);
    expect(v).toContain('filename="in_voice__.._');
    expect(v).toContain("filename*=UTF-8''");
  });
});
