import { env } from "@/lib/env";
import { APP_VERSION } from "@/lib/version";
import { runScheduler } from "./recurring";

let started = false;
let timer: NodeJS.Timeout | null = null;
let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** One-line summary of the effective configuration. Never prints secret values. */
function banner(installMode: string) {
  const appUrl = env.appUrl ?? "(derived from request headers)";
  console.log(
    `[kydi] Kydi ${APP_VERSION} starting: node ${process.version}, NODE_ENV=${process.env.NODE_ENV ?? "development"}, ` +
      `app url ${appUrl}, demo seed ${env.demoSeed ? "ON" : "off"}, scheduler ${process.env.KYDI_DISABLE_SCHEDULER === "true" ? "timer off" : "on"}, ` +
      `install ${installMode}, mail ${env.smtp.host ? `smtp ${env.smtp.host}:${env.smtp.port}` : "stdout"}, log format ${env.logFormat}, ` +
      `trusted proxy hops ${env.trustProxyHops}`,
  );
}

export async function boot() {
  if (started) return;
  started = true;
  const { db } = await import("@/lib/db");
  const { installPolicy, prepareInstallToken } = await import("./install");
  const { LOCKS, withAdvisoryLock } = await import("./locks");

  const userCount = await db.user.count();
  const policy = installPolicy();
  const installMode = userCount > 0 ? "complete" : policy.ownerEmail ? (policy.requireToken ? "owner email + token" : "owner email") : policy.requireToken ? "install token" : "open (development)";
  banner(installMode);

  // One-off boot tasks run under an advisory lock so concurrent boots cannot race.
  await withAdvisoryLock(LOCKS.boot, async () => {
    if (env.demoSeed) {
      const { seedDemo } = await import("./seed");
      const { seedExtras } = await import("./seed-extras");
      const r = await seedDemo(seedExtras);
      if (r.created) console.log("[kydi] demo data seeded (sign-in details are shown on the login page)");
    }
    const { migrateLegacySecrets } = await import("./secret-migration");
    const m = await migrateLegacySecrets();
    if (m.migrated || m.unreadable) {
      console.log(`[kydi] stored credentials re-encrypted with APP_ENCRYPTION_KEY: ${m.migrated} migrated, ${m.unreadable} unreadable (re-enter those in Settings)`);
    }
    await prepareInstallToken();
  }, 120_000);

  const first = await runScheduler();
  console.log("[kydi] scheduler catch-up", JSON.stringify(first));
  if (process.env.KYDI_DISABLE_SCHEDULER === "true") return;
  timer = setInterval(() => {
    if (shuttingDown) return;
    runScheduler().catch((e) => console.error("[kydi] scheduler tick failed", e));
  }, 60_000);
  timer.unref?.();
}

/**
 * SIGTERM/SIGINT: stop scheduling new work and report unhealthy (/api/health answers 503). Next.js' own
 * handler then stops accepting connections and lets in-flight requests finish before calling process.exit;
 * that exit is deferred until Prisma has disconnected cleanly (at most 5 s).
 */
export function registerShutdown() {
  const stop = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (timer) clearInterval(timer);
    console.log(`[kydi] ${signal} received: finishing in-flight requests, scheduler stopped`);
    const realExit = process.exit.bind(process);
    let exiting = false;
    process.exit = ((code?: number) => {
      if (exiting) return realExit(code);
      exiting = true;
      setTimeout(() => realExit(code), 5000).unref();
      import("@/lib/db")
        .then(({ db }) => db.$disconnect())
        .catch(() => undefined)
        .finally(() => {
          console.log("[kydi] database connections closed, exiting");
          realExit(code);
        });
    }) as typeof process.exit;
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));
}
