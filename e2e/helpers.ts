import { createHmac, randomBytes, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * End-to-end helpers. The suite talks HTTP to a running Kydi server (E2E_BASE_URL, default
 * http://localhost:3100) and uses the same database (DATABASE_URL) to provision an isolated user and company.
 */

if (existsSync(path.join(process.cwd(), ".env")) && typeof process.loadEnvFile === "function") process.loadEnvFile(path.join(process.cwd(), ".env"));

export const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/+$/, "");

/** Signed session cookie value, mirroring src/lib/auth/tokens.ts (HMAC-SHA256 with SESSION_SECRET). */
export function signCookie(token: string): string {
  const secret = process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16 ? process.env.SESSION_SECRET : "kydi-insecure-development-secret";
  return `${token}.${createHmac("sha256", secret).update(token).digest("base64url")}`;
}

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export async function api(pathname: string, init: { method?: string; token?: string; company?: number; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.company ? { company: String(init.company) } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json: json as Record<string, unknown> & { data?: Record<string, unknown> } };
}

/** GET a page with a session cookie; does not follow redirects. */
export async function page(pathname: string, cookie: string) {
  const res = await fetch(`${BASE}${pathname}`, { headers: { Cookie: cookie }, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location"), html: res.status === 200 ? await res.text() : "" };
}
