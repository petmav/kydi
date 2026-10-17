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
