import { db } from "@/lib/db";
import { getPortalCustomer } from "@/lib/auth/portal";
import { pdfFor, pdfResponse } from "@/server/pdf";

/** Portal PDF: only the signed-in customer's own non-draft documents (spec §6.3). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; kind: string; id: string }> }) {
  const { slug, kind, id: raw } = await params;
  const session = await getPortalCustomer(slug);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const id = Number(raw);
  const where = { id, customerId: session.customer.id, companyId: session.company.id };
  let ok = false;
  if (kind === "invoices") ok = !!(await db.invoice.findFirst({ where: { ...where, status: { not: "DRAFT" } }, select: { id: true } }));
  else if (kind === "estimates") ok = !!(await db.estimate.findFirst({ where: { ...where, status: { not: "DRAFT" } }, select: { id: true } }));
  else if (kind === "payments") ok = !!(await db.payment.findFirst({ where, select: { id: true } }));
  if (!ok) return new Response("Not found", { status: 404 });
  const file = await pdfFor(kind === "invoices" ? "invoice" : kind === "estimates" ? "estimate" : "payment", session.company.id, id);
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
