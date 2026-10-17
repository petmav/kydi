import { db } from "@/lib/db";
import { isShuttingDown } from "@/server/boot";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for the container health check. Unauthenticated and deliberately minimal: no
 * version, configuration or error details.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (isShuttingDown()) return Response.json({ status: "unavailable" }, { status: 503, headers });
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}

export const HEAD = GET;
