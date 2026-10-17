import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

/**
 * Browser security headers for every page and API response (static assets get the static subset from
 * next.config.ts). A fresh nonce per request feeds a strict Content-Security-Policy; Next.js reads the nonce
 * from the request's CSP header and applies it to its own scripts (pages are rendered dynamically).
 */

/** Responses that Kydi itself embeds in same-origin iframes (PDF previews, receipts). */
const FRAMEABLE = [/^\/api\/pdf\//, /^\/pdf\//, /^\/customer\/[^/]+\/view\/[^/]+\/pdf$/, /^\/portal\/[^/]+\/pdf\//, /^\/api\/reports\//, /^\/api\/files\/receipt\//];

/** Routes that set their own, stricter Content-Security-Policy (file downloads). */
const OWN_CSP = [/^\/api\/files\//];

function forwardedHttps(req: NextRequest): boolean {
  const raw = Number(process.env.KYDI_TRUST_PROXY_HOPS ?? "1");
  const hops = Number.isInteger(raw) && raw >= 0 ? raw : 1;
  const list = (req.headers.get("x-forwarded-proto") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length) return (list[Math.max(0, list.length - Math.max(hops, 1))] ?? "").toLowerCase() === "https";
  return req.nextUrl.protocol === "https:" || (process.env.APP_URL ?? "").startsWith("https://");
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const frameable = FRAMEABLE.some((r) => r.test(path));
  const https = forwardedHttps(req);
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";

  const requestHeaders = new Headers(req.headers);
  const ownCsp = OWN_CSP.some((r) => r.test(path));
  // PDF responses only get frame-ancestors: a full policy can stop the browser's built-in PDF viewer.
  const csp = frameable ? "frame-ancestors 'self'" : buildCsp({ nonce, dev, https, frameAncestors: "'none'" });
  requestHeaders.set("x-nonce", nonce);
  if (!frameable) requestHeaders.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (!ownCsp) res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", frameable ? "SAMEORIGIN" : "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  if (!frameable) res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (https) res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)" }],
};
