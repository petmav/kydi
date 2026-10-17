import { randomBytes, timingSafeEqual } from "node:crypto";
import { db, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { sha256 } from "@/lib/auth/tokens";

/**
 * First-run protection for the install wizard (who may create the first administrator).
 *
 * - ZENITH_OWNER_EMAIL set: only that email address may create the first administrator.
 * - Otherwise, in production: a one-time install token printed to stdout at boot must be entered.
 * - KYDI_INSTALL_REQUIRE_TOKEN=true requires the token in addition to the owner email.
 * - Development without an owner email: open (local convenience).
 * Once any user exists the wizard is closed for good.
 */

export type InstallPolicy = { ownerEmail: string | null; requireToken: boolean };

export function resolveInstallPolicy(input: { production: boolean; ownerEmail?: string | null; requireToken?: boolean }): InstallPolicy {
  const ownerEmail = input.ownerEmail?.trim().toLowerCase() || null;
  const requireToken = !!input.requireToken || (input.production && !ownerEmail);
  return { ownerEmail, requireToken };
}

export function installPolicy(): InstallPolicy {
  return resolveInstallPolicy({ production: env.isProduction, ownerEmail: env.ownerEmail, requireToken: env.installRequireToken });
}

const TOKEN_KEY = "install_token_hash";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

/** 20 symbols from a 31-symbol alphabet (~99 bits), shown as XXXXX-XXXXX-XXXXX-XXXXX. */
export function generateInstallToken(): string {
  const bytes = randomBytes(40);
  let out = "";
  for (const b of bytes) {
    if (b >= 248) continue; // 248 = 31 * 8, keeps the distribution uniform
    out += ALPHABET[b % 31];
    if (out.length === 20) break;
  }
  if (out.length < 20) return generateInstallToken();
  return out.match(/.{5}/g)!.join("-");
}

export function normalizeInstallToken(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function installTokenHash(raw: string): string {
  return sha256(`kydi-install:${normalizeInstallToken(raw)}`);
}

/** Constant-time comparison of two hex digests. */
export function sameDigest(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * Boot hook: while no user exists and the policy needs a token, mint a fresh one-time token, store only its
 * hash and print it to stdout. Restarting the container replaces the token.
 */
export async function prepareInstallToken(log: (line: string) => void = console.log): Promise<boolean> {
  const policy = installPolicy();
  if (!policy.requireToken) return false;
  if ((await db.user.count()) > 0) {
    await db.appSetting.deleteMany({ where: { key: TOKEN_KEY } });
    return false;
  }
  const token = generateInstallToken();
  await db.appSetting.upsert({ where: { key: TOKEN_KEY }, create: { key: TOKEN_KEY, value: installTokenHash(token) }, update: { value: installTokenHash(token) } });
  log("[kydi] ================================================================");
  log("[kydi] Kydi is not installed yet. To create the first administrator, open");
  log("[kydi] /install and enter this one-time install token:");
  log(`[kydi]     ${token}`);
  log("[kydi] The token is replaced on every restart until installation is complete.");
  log("[kydi] ================================================================");
  return true;
}

export type InstallCheck = { ok: true } | { ok: false; field: "email" | "token" | "form"; message: string };

/** Validates an install attempt inside the install transaction (call after taking the install lock). */
export async function checkInstallAttempt(tx: Tx, email: string, token: string | undefined, policy = installPolicy()): Promise<InstallCheck> {
  if ((await tx.user.count()) > 0) return { ok: false, field: "form", message: "Kydi is already installed. Sign in instead." };
  if (policy.ownerEmail && email.trim().toLowerCase() !== policy.ownerEmail) {
    return { ok: false, field: "email", message: "This instance is reserved for its owner. Use the email address of the account that deployed Kydi." };
  }
  if (policy.requireToken) {
    const stored = await tx.appSetting.findUnique({ where: { key: TOKEN_KEY } });
    if (!stored || !token || !sameDigest(stored.value, installTokenHash(token))) {
      return { ok: false, field: "token", message: "The install token is incorrect. Copy it from the application log (it changes on every restart)." };
    }
  }
  return { ok: true };
}

/** Serialises concurrent install attempts (transaction-scoped Postgres advisory lock). */
export async function lockInstall(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7239001)`;
}

export async function consumeInstallToken(tx: Tx): Promise<void> {
  await tx.appSetting.deleteMany({ where: { key: TOKEN_KEY } });
}
