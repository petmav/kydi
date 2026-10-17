import { headers } from "next/headers";
import { clientIpFrom, isHttpsFrom } from "@/lib/request-meta";

/** True when the current request reached the proxy over https (cookies get the Secure flag). */
export async function isSecureRequest(): Promise<boolean> {
  return isHttpsFrom(await headers());
}

/** Base options for every cookie Kydi sets: httpOnly, SameSite=Lax, path /, Secure behind https. */
export async function secureCookies(): Promise<{ httpOnly: true; sameSite: "lax"; secure: boolean; path: "/" }> {
  return { httpOnly: true, sameSite: "lax", secure: await isSecureRequest(), path: "/" };
}

export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}
