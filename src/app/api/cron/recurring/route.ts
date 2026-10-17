import { env } from "@/lib/env";
import { cronAuthorized } from "@/lib/cron-auth";
import { runScheduler } from "@/server/recurring";

export const dynamic = "force-dynamic";

/** Cron-like trigger: generates due recurring invoices and runs the overdue/expiry sweeps. */
async function handle(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"), env.cronSecret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await runScheduler();
  return Response.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
