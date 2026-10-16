import { db } from "@/lib/db";
import { pdfFor, pdfResponse } from "@/server/pdf";

/** Permanent public PDF link by unique hash ("Copy PDF URL"). Does not expire and does not mark viewed. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string; hash: string }> }) {
  const { kind, hash } = await params;
  const download = new URL(req.url).searchParams.has("download");
  let rec: { id: number; companyId: number } | null = null;
  if (kind === "invoices") rec = await db.invoice.findUnique({ where: { uniqueHash: hash }, select: { id: true, companyId: true } });
  else if (kind === "estimates") rec = await db.estimate.findUnique({ where: { uniqueHash: hash }, select: { id: true, companyId: true } });
  else if (kind === "payments") rec = await db.payment.findUnique({ where: { uniqueHash: hash }, select: { id: true, companyId: true } });
  if (!rec) return new Response("Not found", { status: 404 });
  const file = await pdfFor(kind === "invoices" ? "invoice" : kind === "estimates" ? "estimate" : "payment", rec.companyId, rec.id);
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, download);
}
