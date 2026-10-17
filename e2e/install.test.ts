import { afterAll, describe, expect, it } from "vitest";
import { BASE } from "./helpers";
import { db } from "@/lib/db";
import { checkInstallAttempt, lockInstall, resolveInstallPolicy } from "@/server/install";

/** The install wizard is closed for good once any user exists (HTTP and the server-side check). */
afterAll(async () => {
  await db.$disconnect();
});

describe("install wizard after installation", () => {
  it("redirects /install away once users exist", async () => {
    expect(await db.user.count()).toBeGreaterThan(0);
    const res = await fetch(`${BASE}/install`, { redirect: "manual" });
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get("location") ?? "").toMatch(/\/login/);
  });

  it("refuses every install attempt, whatever the policy", async () => {
    for (const policy of [
      resolveInstallPolicy({ production: true, ownerEmail: "owner@example.org" }),
      resolveInstallPolicy({ production: true }),
      resolveInstallPolicy({ production: false }),
    ]) {
      const r = await db.$transaction(async (tx) => {
        await lockInstall(tx);
        return checkInstallAttempt(tx, "owner@example.org", "AAAAA-BBBBB-CCCCC-DDDDD", policy);
      });
      expect(r).toEqual({ ok: false, field: "form", message: "Kydi is already installed. Sign in instead." });
    }
  });
});

describe("scheduler retention sweep and cron secret", () => {
  it("rejects a wrong cron secret and purges expired sessions on a run", async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return; // route disabled without CRON_SECRET
    expect((await fetch(`${BASE}/api/cron/recurring`, { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    const user = await db.user.findFirstOrThrow();
    const hash = `expired-${Date.now()}-${Math.random()}`;
    await db.session.create({ data: { tokenHash: hash, userId: user.id, expiresAt: new Date(Date.now() - 60_000) } });
    const res = await fetch(`${BASE}/api/cron/recurring`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; skipped?: boolean };
    expect(body.ok).toBe(true);
    if (!body.skipped) expect(await db.session.count({ where: { tokenHash: hash } })).toBe(0);
  });
});

describe("credential migration from SESSION_SECRET to APP_ENCRYPTION_KEY", () => {
  it("re-encrypts legacy v1 values in the database and leaves v2 values alone", async () => {
    const { encryptSecretLegacy, decryptJson, decryptSecret, encryptSecret } = await import("@/lib/secrets");
    const { migrateLegacySecrets } = await import("@/server/secret-migration");
    const session = process.env.SESSION_SECRET;
    if (!session || !process.env.APP_ENCRYPTION_KEY) return; // needs the server's secrets
    const user = await db.user.findFirstOrThrow();
    const { createCompanyForUser, deleteCompany } = await import("@/lib/companies");
    const company = await createCompanyForUser(user.id, { name: `E2E Migration ${Date.now()}`, currency: "USD", country: "US", time_zone: "UTC" });
    try {
      const mail = await db.mailConfig.create({ data: { companyId: company.id, driver: "smtp", options: { host: "smtp.example.org" }, secrets: encryptSecretLegacy(JSON.stringify({ password: "legacy-smtp-pass" }), session) } });
      const legacyKey = await db.exchangeRateProvider.create({ data: { companyId: company.id, driver: "currency_freak", keyEncrypted: encryptSecretLegacy("legacy-api-key", session), currencies: ["EUR"] } });
      const current = await db.exchangeRateProvider.create({ data: { companyId: company.id, driver: "currency_freak", keyEncrypted: encryptSecret("current-api-key"), currencies: ["GBP"] } });
      const r = await migrateLegacySecrets();
      expect(r.migrated).toBeGreaterThanOrEqual(2);
      const m = await db.mailConfig.findUniqueOrThrow({ where: { id: mail.id } });
      expect(m.secrets?.startsWith("v2:")).toBe(true);
      expect(decryptJson(m.secrets)).toEqual({ password: "legacy-smtp-pass" });
      const k = await db.exchangeRateProvider.findUniqueOrThrow({ where: { id: legacyKey.id } });
      expect(k.keyEncrypted.startsWith("v2:")).toBe(true);
      expect(decryptSecret(k.keyEncrypted)).toBe("legacy-api-key");
      // Rotating SESSION_SECRET afterwards does not matter: v2 values only need APP_ENCRYPTION_KEY.
      expect(decryptSecret(k.keyEncrypted, undefined, ["a-completely-different-session-secret-0123456789"])).toBe("legacy-api-key");
      expect((await db.exchangeRateProvider.findUniqueOrThrow({ where: { id: current.id } })).keyEncrypted).toBe(current.keyEncrypted);
    } finally {
      await deleteCompany(company.id);
    }
  });
});
