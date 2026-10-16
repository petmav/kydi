import crypto from "node:crypto";
import { env } from "@/lib/env";
import { runScheduler } from "@/server/recurring";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** Cron-like trigger: generates due recurring invoices and runs the overdue/expiry sweeps. */
async function handle(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await runScheduler();
  return Response.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
