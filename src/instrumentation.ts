/**
 * Runs once per server process. In production it seeds demo data when requested, performs an on-boot
 * catch-up of recurring invoices and daily sweeps, then checks every minute (spec §4.15).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { boot } = await import("./server/boot");
  boot().catch((e) => console.error("[kydi] boot tasks failed", e));
}
