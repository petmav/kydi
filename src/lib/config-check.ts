/**
 * Production configuration guard. `checkProductionConfig` is pure (takes an env map) so it can be unit tested;
 * `src/instrumentation.ts` calls it at boot and exits with a clear message when anything is fatal.
 */

import { createHash } from "node:crypto";

/** Values that have appeared in this repository, its examples or its preview manifest. Never valid in production. */
export const KNOWN_WEAK_SECRETS = new Set([
  "kydi-insecure-development-secret",
  "kydi-insecure-development-encryption-key",
  "dev-only-session-secret-please-change-0123456789",
  "dev-cron-secret",
  "changeme",
  "change-me",
  "secret",
  "password",
]);

/** SHA-256 of retired preview secrets, kept as hashes so the values themselves are not in the repository. */
const RETIRED_SECRET_HASHES = new Set([
  "7be26c386082f731eedbc0b9d35beaaa11c035dac89f0312bbaa9a83dbc8e589",
  "86450946dbe46cace8a07ee29ad41ae0258ef11ae7ed49f6422c038679a14c9c",
]);

export type ConfigReport = { errors: string[]; warnings: string[] };

type EnvMap = Record<string, string | undefined>;

function weak(value: string): boolean {
  const v = value.trim();
  if (KNOWN_WEAK_SECRETS.has(v) || KNOWN_WEAK_SECRETS.has(v.toLowerCase())) return true;
  if (RETIRED_SECRET_HASHES.has(createHash("sha256").update(v).digest("hex"))) return true;
  if (/^(.)\1+$/.test(v)) return true; // one repeated character
  if (/please-change|change-?me|example|placeholder/i.test(v)) return true;
  return new Set(v).size < 8; // too little variety to be random
}

function checkSecret(errors: string[], env: EnvMap, name: string, purpose: string, min = 32) {
  const v = env[name];
  if (!v) errors.push(`${name} is not set. ${purpose} Generate one with: openssl rand -hex 32`);
  else if (v.length < min) errors.push(`${name} is too short (${v.length} characters). Use ${min} or more random characters.`);
  else if (weak(v)) errors.push(`${name} is a known development, example or preview value, or is not random. Generate a new one with: openssl rand -hex 32`);
}

export function checkProductionConfig(env: EnvMap): ConfigReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!env.DATABASE_URL) errors.push("DATABASE_URL is not set.");
  checkSecret(errors, env, "SESSION_SECRET", "It signs session cookies.");
  checkSecret(errors, env, "APP_ENCRYPTION_KEY", "It encrypts stored mail and exchange-rate credentials.");
  if (env.SESSION_SECRET && env.APP_ENCRYPTION_KEY && env.SESSION_SECRET === env.APP_ENCRYPTION_KEY) {
    errors.push("APP_ENCRYPTION_KEY must differ from SESSION_SECRET.");
  }
  if (env.CRON_SECRET) checkSecret(errors, env, "CRON_SECRET", "It protects /api/cron/recurring.", 24);

  const appUrl = env.APP_URL?.trim();
  if (appUrl) {
    try {
      const u = new URL(/^https?:\/\//i.test(appUrl) ? appUrl : `https://${appUrl}`);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
      if (u.protocol === "http:" && !["localhost", "127.0.0.1"].includes(u.hostname)) warnings.push("APP_URL uses http://. Serve Kydi over https in production.");
    } catch {
      errors.push(`APP_URL is not a valid http(s) URL.`);
    }
  } else {
    warnings.push("APP_URL is not set. Links in emails are derived from request headers; set APP_URL (or alias ZENITH_PUBLIC_URL).");
  }

  if (env.KYDI_DEMO_SEED === "true") warnings.push("KYDI_DEMO_SEED=true: demo data with a publicly known password is created on an empty database. Never use this for real data.");
  if (!env.CRON_SECRET) warnings.push("CRON_SECRET is not set: /api/cron/recurring is disabled (the in-process scheduler still runs).");
  return { errors, warnings };
}
