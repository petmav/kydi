/**
 * Outbound-request guards (spec §10.2: custom exchange-rate URLs must be public http(s) hosts). Rejects
 * loopback, private, link-local, CGNAT and unique-local addresses plus internal-only host names. This is a
 * syntactic check; it does not resolve DNS.
 */

/** 4 for dotted IPv4, 6 for IPv6 literals, 0 otherwise (browser-safe replacement for node:net isIP). */
function ipKind(h: string): 0 | 4 | 6 {
  if (/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(h)) return 4;
  if (h.includes(":") && /^[0-9a-f:.]+$/.test(h)) return 6;
  return 0;
}

function privateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function privateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return privateIPv4(mapped[1]);
  return /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
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
  return !["localhost", "local", "internal", "intranet", "lan", "home", "corp", "localdomain"].some((t) => h === t || h.endsWith(`.${t}`));
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
