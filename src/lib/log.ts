import { format } from "node:util";

/**
 * Server log hygiene. `installLogging()` (called once from src/instrumentation.ts) routes console output
 * through `redact()` so configured secrets, bearer tokens, API tokens, database passwords and credential-like
 * key/value pairs never reach stdout, and optionally emits one JSON object per line (KYDI_LOG_FORMAT=json).
 */

const SECRET_ENV = ["SESSION_SECRET", "APP_ENCRYPTION_KEY", "CRON_SECRET", "SMTP_PASS", "KYDI_LEGACY_SESSION_SECRET", "POSTGRES_PASSWORD"];

/** Secret values taken from the environment (min. 6 characters so that short values do not mangle logs). */
export function secretValuesFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  const out = SECRET_ENV.map((k) => env[k]).filter((v): v is string => !!v && v.length >= 6);
  try {
    const db = env.DATABASE_URL ? new URL(env.DATABASE_URL) : null;
    if (db?.password) {
      out.push(db.password);
      const decoded = decodeURIComponent(db.password);
      if (decoded !== db.password) out.push(decoded);
    }
  } catch {
    // not a URL
  }
  return [...new Set(out)].sort((a, b) => b.length - a.length);
}

const KEY_VALUE = /\b((?:[a-z_]*pass(?:word)?|[a-z_]*secret|[a-z_]*token|authorization|cookie|set-cookie|api[_-]?key|x-postmark-server-token)["']?\s*[:=]\s*)(["'`])((?:\\.|(?!\2).)*)\2/gi;

export function redact(text: string, secrets: string[] = secretValuesFromEnv()): string {
  let out = text;
  for (const s of secrets) out = out.split(s).join("[redacted]");
  return out
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 [redacted]")
    .replace(/\bkyd_[A-Za-z0-9]+_[A-Za-z0-9_-]{16,}/g, "kyd_[redacted]")
    .replace(/\b(postgres(?:ql)?:\/\/[^:/@\s]+:)[^@\s]+@/gi, "$1[redacted]@")
    .replace(KEY_VALUE, (_m, key: string, q: string) => `${key}${q}[redacted]${q}`);
}

type Level = "debug" | "info" | "warn" | "error";
let installed = false;

export function installLogging(): void {
  if (installed) return;
  installed = true;
  const json = process.env.KYDI_LOG_FORMAT === "json";
  const secrets = secretValuesFromEnv();
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  const write = (level: Level, sink: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      const message = redact(format(...args), secrets);
      if (json) sink(JSON.stringify({ time: new Date().toISOString(), level, msg: message }));
      else sink(message);
    };
  console.log = write("info", original.log);
  console.info = write("info", original.info);
  console.warn = write("warn", original.warn);
  console.error = write("error", original.error);
  console.debug = write("debug", original.debug);
}
