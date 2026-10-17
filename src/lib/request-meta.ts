import { env } from "@/lib/env";

/**
 * Client address and scheme behind reverse proxies. Zenith (and most deployments) terminate TLS in one proxy
 * hop that appends the peer address to X-Forwarded-For, so the trustworthy entry is the one `hops` places from
 * the end; anything before it is client-supplied. KYDI_TRUST_PROXY_HOPS=0 ignores forwarding headers.
 */

type HeaderBag = { get(name: string): string | null };

function pick(list: string | null, hops: number): string | null {
  if (!list) return null;
  const parts = list.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (hops <= 0) return null;
  return parts[Math.max(0, parts.length - hops)] ?? null;
}

export function clientIpFrom(h: HeaderBag, hops: number = env.trustProxyHops): string {
  const ip = pick(h.get("x-forwarded-for"), hops) ?? (hops > 0 ? h.get("x-real-ip")?.trim() || null : null);
  return ip ? ip.replace(/^::ffff:/, "").slice(0, 64) : "unknown";
}

/** True when the original request used https (forwarded proto, else APP_URL). */
export function isHttpsFrom(h: HeaderBag, hops: number = env.trustProxyHops): boolean {
  const proto = pick(h.get("x-forwarded-proto"), Math.max(hops, 1));
  if (proto) return proto.toLowerCase() === "https";
  return (env.appUrl ?? "").startsWith("https://");
}

/**
 * CSRF guard for cookie-authenticated requests with unsafe methods (the REST API also accepts the session
 * cookie). Sec-Fetch-Site must be same-origin when present; otherwise the Origin host must match the request
 * host (X-Forwarded-Host/Host) or APP_URL. Requests carrying neither header are refused.
 */
export function isSameOriginRequest(h: HeaderBag): boolean {
  const site = h.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = h.get("origin");
  if (!origin || origin === "null") return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const hosts = [h.get("x-forwarded-host"), h.get("host")].flatMap((v) => (v ? v.split(",").map((s) => s.trim().toLowerCase()) : []));
  if (env.appUrl) {
    try {
      hosts.push(new URL(env.appUrl).host.toLowerCase());
    } catch {
      // ignore malformed APP_URL (reported at boot)
    }
  }
  return hosts.includes(originHost);
}
