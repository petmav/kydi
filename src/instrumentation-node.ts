import { installLogging } from "./lib/log";
import { checkProductionConfig } from "./lib/config-check";
import { boot, registerShutdown } from "./server/boot";

/**
 * Node.js server start-up: redacting (optionally JSON) logging, production configuration guard, shutdown
 * handling, then boot tasks (demo seed when requested, credential re-encryption, install token, recurring
 * catch-up and the minute scheduler, spec §4.15).
 */
export async function registerNode() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  installLogging();
  if (process.env.NODE_ENV === "production") {
    const report = checkProductionConfig(process.env);
    for (const w of report.warnings) console.warn(`[kydi] warning: ${w}`);
    if (report.errors.length) {
      for (const e of report.errors) console.error(`[kydi] configuration error: ${e}`);
      console.error("[kydi] refusing to start with an unsafe production configuration (see PRODUCTION.md).");
      process.exit(1);
    }
  }
  registerShutdown();
  boot().catch((e) => console.error("[kydi] boot tasks failed", e));
}
