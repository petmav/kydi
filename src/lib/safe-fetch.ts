import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupAddress, LookupOneOptions, LookupAllOptions } from "node:dns";
import { ipKind, isPrivateAddress, isPublicHostname } from "@/lib/net";

/**
 * SSRF protection for outbound requests to tenant-supplied hosts (exchange-rate provider URLs, company SMTP
 * servers). Host names are resolved and every resulting address is checked against loopback, private,
 * link-local, CGNAT, unique-local, multicast and translated ranges. The check runs inside the socket `lookup`
 * hook, i.e. on the exact address that is connected to, so DNS rebinding between check and connect is not
 * possible. Redirects are never followed. Single-label names such as the Compose service `db` are refused.
 */

export class BlockedDestinationError extends Error {
  constructor(message = "The destination is not a public internet address.") {
    super(message);
    this.name = "BlockedDestinationError";
  }
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** Resolves `host` and returns its addresses, throwing when the name or any address is not public. */
export async function resolvePublicAddresses(host: string): Promise<LookupAddress[]> {
  const h = host.trim().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (ipKind(h)) {
    if (isPrivateAddress(h)) throw new BlockedDestinationError();
    return [{ address: h, family: ipKind(h) as 4 | 6 }];
  }
  if (!isPublicHostname(h)) throw new BlockedDestinationError("Use a public host name.");
  const addresses = await dns.promises.lookup(h, { all: true, verbatim: true });
  if (!addresses.length) throw new BlockedDestinationError("The host name does not resolve.");
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new BlockedDestinationError();
  return addresses;
}

/** `lookup` implementation for http/https/net that only ever yields public addresses. */
export function guardedLookup(hostname: string, options: LookupOneOptions | LookupAllOptions | number, callback: LookupCallback): void {
  const wantAll = typeof options === "object" && options !== null && "all" in options && options.all === true;
  resolvePublicAddresses(hostname).then(
    (addresses) => {
      if (wantAll) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    },
    (err: Error) => callback(Object.assign(err, { code: "EBLOCKED" }) as NodeJS.ErrnoException, wantAll ? [] : "", 0),
  );
}

export type SafeResponse = { status: number; headers: http.IncomingHttpHeaders; body: string };

/**
 * GET (or POST) a URL on a public host with a timeout and a response size cap. 3xx responses are returned as
 * errors rather than followed.
 */
export function safeRequest(
  rawUrl: string,
  opts: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBytes?: number } = {},
): Promise<SafeResponse> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const maxBytes = opts.maxBytes ?? 1_000_000;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return Promise.reject(new BlockedDestinationError("The URL is not valid."));
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    return Promise.reject(new BlockedDestinationError("Only plain http(s) URLs are allowed."));
  }
  const lib = url.protocol === "https:" ? https : http;
  // IP-literal hosts never reach the lookup hook (no DNS), so they are checked here; names are checked again
  // on the resolved addresses at connect time.
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (ipKind(literal) && isPrivateAddress(literal)) return Promise.reject(new BlockedDestinationError());
  if (!ipKind(literal) && !isPublicHostname(literal)) return Promise.reject(new BlockedDestinationError("Use a public host name."));
  return new Promise<SafeResponse>((resolve, reject) => {
    const req = lib.request(
      url,
      { method: opts.method ?? "GET", headers: opts.headers, lookup: guardedLookup as unknown as typeof dns.lookup, timeout: timeoutMs },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          reject(new BlockedDestinationError(`The server answered with a redirect (HTTP ${status}); redirects are not followed.`));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new Error("The response is too large."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error(`The request timed out after ${Math.round(timeoutMs / 1000)} s.`)));
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
