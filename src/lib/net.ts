/**
 * Outbound-request guards (spec §10.2: custom exchange-rate URLs must be public http(s) hosts). Rejects
 * loopback, private, link-local, CGNAT, unique-local, multicast, documentation and translated addresses plus
 * internal-only and single-label host names (for example the Compose service names `db` and `app`).
 * Browser-safe and syntactic only; src/lib/safe-fetch.ts repeats the address check on the resolved IPs at
 * connect time (DNS rebinding) for every outbound request to tenant-supplied hosts.
 */

/** 4 for dotted IPv4, 6 for IPv6 literals, 0 otherwise (browser-safe replacement for node:net isIP). */
export function ipKind(h: string): 0 | 4 | 6 {
  if (/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(h)) return 4;
  if (h.includes(":") && /^[0-9a-f:.]+$/i.test(h)) return 6;
  return 0;
}

export function privateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // IETF protocol assignments, TEST-NET-1
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51) || // TEST-NET-2 (198.51.100.0/24)
    (a === 203 && b === 0) || // TEST-NET-3 (203.0.113.0/24)
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expands an IPv6 literal (optionally with a trailing dotted IPv4) to eight 16-bit groups, or null. */
function ipv6Groups(ip: string): number[] | null {
  let v = ip.toLowerCase();
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (dotted) {
    if (ipKind(dotted[1]) !== 4) return null;
    const [a, b, c, d] = dotted[1].split(".").map(Number);
    v = v.slice(0, -dotted[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = v.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (all.length !== 8 || all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

function embeddedV4(g: number[]): string {
  return [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join(".");
}

export function privateIPv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return true; // unparseable: treat as unsafe
  const zeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroPrefix(8) || (zeroPrefix(7) && g[7] === 1)) return true; // :: and ::1
  if (zeroPrefix(5) && g[5] === 0xffff) return privateIPv4(embeddedV4(g)); // IPv4-mapped
  if (zeroPrefix(6)) return true; // IPv4-compatible (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64 well-known prefix: may translate to private IPv4
  if (g[0] === 0x2002) return privateIPv4([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255].join(".")); // 6to4
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard 100::/64
  const top = g[0] >> 8;
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link-local, site-local
  if (top === 0xff) return true; // multicast
  return false;
}

/** True for IP literals that must never be contacted on behalf of a tenant. */
export function isPrivateAddress(ip: string): boolean {
  const h = ip.trim().replace(/^\[|\]$/g, "").split("%")[0];
  const kind = ipKind(h);
  if (kind === 4) return privateIPv4(h);
  if (kind === 6) return privateIPv6(h);
  return true;
}

export function isPublicHostname(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return false;
  const kind = ipKind(h);
  if (kind === 4) return !privateIPv4(h);
  if (kind === 6) return !privateIPv6(h);
  if (!/^[a-z0-9.-]+$/.test(h) || !h.includes(".")) return false;
  const tld = h.split(".").pop() ?? "";
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]+)$/.test(tld)) return false; // numeric forms such as 2130706433 or 0x7f.1
  return !["localhost", "local", "internal", "intranet", "lan", "home", "corp", "localdomain", "arpa", "test", "invalid", "example"].some((t) => h === t || h.endsWith(`.${t}`));
}

export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  return isPublicHostname(url.hostname);
}
