/** Centralised, typed access to runtime configuration. */

const isProductionRuntime = () => process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";

/** Development-only fallbacks. Production refuses to start with these (see src/lib/config-check.ts). */
const DEV_SESSION_SECRET = "kydi-insecure-development-secret";
const DEV_ENCRYPTION_KEY = "kydi-insecure-development-encryption-key";

const trimmed = (name: string): string | undefined => {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
};

export const env = {
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
  /** Signs session and portal cookies. Validated at boot in production (32+ characters, not a known value). */
  get sessionSecret(): string {
    const s = process.env.SESSION_SECRET;
    if (!s || s.length < 32) {
      if (isProductionRuntime()) throw new Error("SESSION_SECRET must be set to 32 or more random characters");
      return s && s.length >= 16 ? s : DEV_SESSION_SECRET;
    }
    return s;
  },
  /**
   * Key material for encrypting third-party credentials at rest (mail passwords, API keys). Independent of
   * SESSION_SECRET so that rotating the session secret never breaks stored credentials.
   */
  get encryptionKey(): string {
    const k = process.env.APP_ENCRYPTION_KEY;
    if (!k || k.length < 32) {
      if (isProductionRuntime()) throw new Error("APP_ENCRYPTION_KEY must be set to 32 or more random characters");
      return k && k.length >= 16 ? k : DEV_ENCRYPTION_KEY;
    }
    return k;
  },
  /**
   * Secrets that may have encrypted legacy (`v1:`) values: the current SESSION_SECRET plus an optional
   * KYDI_LEGACY_SESSION_SECRET for installations that rotated the session secret before migrating.
   */
  get legacySecrets(): string[] {
    const out: string[] = [];
    const current = process.env.SESSION_SECRET;
    if (current) out.push(current);
    else if (!isProductionRuntime()) out.push(DEV_SESSION_SECRET);
    const previous = process.env.KYDI_LEGACY_SESSION_SECRET;
    if (previous && !out.includes(previous)) out.push(previous);
    return out;
  },
  /** Public base URL (APP_URL, or ZENITH_PUBLIC_URL through the manifest alias). No trailing slash. */
  get appUrl(): string | undefined {
    const u = trimmed("APP_URL");
    if (!u) return undefined;
    const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    return withScheme.replace(/\/+$/, "");
  },
  get uploadDir(): string {
    return trimmed("UPLOAD_DIR") || "./uploads";
  },
  get cronSecret(): string | undefined {
    return trimmed("CRON_SECRET");
  },
  get demoSeed(): boolean {
    return process.env.KYDI_DEMO_SEED === "true";
  },
  /**
   * Email of the deploying account (KYDI_OWNER_EMAIL, which the manifest aliases to Zenith's built-in
   * ZENITH_OWNER_EMAIL; ZENITH_OWNER_EMAIL itself is also read). Binds the install wizard when set.
   */
  get ownerEmail(): string | undefined {
    const e = (trimmed("KYDI_OWNER_EMAIL") ?? trimmed("ZENITH_OWNER_EMAIL"))?.toLowerCase();
    return e && e.includes("@") ? e : undefined;
  },
  /** Require the boot-time install token even when ZENITH_OWNER_EMAIL is set. */
  get installRequireToken(): boolean {
    return process.env.KYDI_INSTALL_REQUIRE_TOKEN === "true";
  },
  /**
   * Number of reverse proxies in front of the app that append to X-Forwarded-For (Zenith terminates TLS in
   * one proxy hop). 0 ignores forwarding headers for client IPs.
   */
  get trustProxyHops(): number {
    const raw = trimmed("KYDI_TRUST_PROXY_HOPS");
    const n = raw === undefined ? 1 : Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 1;
  },
  /** `json` switches server logs to one JSON object per line. */
  get logFormat(): "text" | "json" {
    return process.env.KYDI_LOG_FORMAT === "json" ? "json" : "text";
  },
  smtp: {
    get host() {
      return trimmed("SMTP_HOST") || "";
    },
    get port() {
      return Number(process.env.SMTP_PORT || 587);
    },
    get user() {
      return trimmed("SMTP_USER") || "";
    },
    get pass() {
      return process.env.SMTP_PASS || "";
    },
    /** SMTP_FROM, combined with SMTP_FROM_NAME when SMTP_FROM is a bare address. */
    get from() {
      const from = trimmed("SMTP_FROM");
      if (!from) return "Kydi <no-reply@kydi.local>";
      const name = trimmed("SMTP_FROM_NAME");
      if (name && !from.includes("<")) return `"${name.replace(/["\\\r\n]/g, "")}" <${from}>`;
      return from;
    },
  },
};
