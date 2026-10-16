import { env } from "@/lib/env";
import { runScheduler } from "./recurring";

let started = false;

export async function boot() {
  if (started) return;
  started = true;
  if (env.demoSeed) {
    const { seedDemo } = await import("./seed");
    const { seedExtras } = await import("./seed-extras");
    const r = await seedDemo(seedExtras);
    if (r.created) console.log("[halyard] demo data seeded (admin@halyard.test / password123)");
  }
  const first = await runScheduler();
  console.log("[halyard] scheduler catch-up", JSON.stringify(first));
  if (process.env.HALYARD_DISABLE_SCHEDULER === "true") return;
  const timer = setInterval(() => {
    runScheduler().catch((e) => console.error("[halyard] scheduler tick failed", e));
  }, 60_000);
  timer.unref?.();
}
