/** Centralised, typed access to runtime configuration. */
export const env = {
  get sessionSecret(): string {
    const s = process.env.SESSION_SECRET;
    if (!s || s.length < 16) {
      if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
        throw new Error("SESSION_SECRET must be set (16+ characters)");
      }
      return "halyard-insecure-development-secret";
    }
    return s;
  },
  get appUrl(): string | undefined {
    const u = process.env.APP_URL?.trim();
    return u ? u.replace(/\/+$/, "") : undefined;
  },
  get uploadDir(): string {
    return process.env.UPLOAD_DIR?.trim() || "./uploads";
  },
  get cronSecret(): string | undefined {
    return process.env.CRON_SECRET?.trim() || undefined;
  },
  get demoSeed(): boolean {
    return process.env.HALYARD_DEMO_SEED === "true";
  },
  smtp: {
    get host() {
      return process.env.SMTP_HOST?.trim() || "";
    },
    get port() {
      return Number(process.env.SMTP_PORT || 587);
    },
    get user() {
      return process.env.SMTP_USER?.trim() || "";
    },
    get pass() {
      return process.env.SMTP_PASS || "";
    },
    get from() {
      return process.env.SMTP_FROM?.trim() || "Halyard <no-reply@halyard.local>";
    },
  },
};
