/** Content-Security-Policy builder (edge-safe, no imports; used by src/middleware.ts and its tests). */
export function buildCsp(opts: { nonce: string; dev: boolean; https: boolean; frameAncestors: "'none'" | "'self'" }): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${opts.nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    // React style attributes need 'unsafe-inline' for styles (a nonce would disable it); scripts stay strict.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${opts.dev ? " ws: wss:" : ""}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    `frame-ancestors ${opts.frameAncestors}`,
  ];
  if (opts.https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
