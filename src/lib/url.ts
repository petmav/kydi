import { headers } from "next/headers";
import { env } from "@/lib/env";

/** Absolute base URL for links in emails/PDFs. Uses APP_URL, else request headers. */
export async function getBaseUrl(): Promise<string> {
  if (env.appUrl) return env.appUrl;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = (h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")).split(",")[0].trim();
      return `${proto}://${host}`;
    }
  } catch {
    // headers() unavailable outside a request (e.g. background jobs)
  }
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/** Only allow relative in-app redirect targets. */
export function safeNext(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
