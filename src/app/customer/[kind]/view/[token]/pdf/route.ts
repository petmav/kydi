import { resolveEmailToken, type DocKind } from "@/server/email";
import { pdfFor, pdfResponse } from "@/server/pdf";

const KINDS: Record<string, DocKind> = { invoices: "invoice", estimates: "estimate", payments: "payment" };

export async function GET(req: Request, { params }: { params: Promise<{ kind: string; token: string }> }) {
  const { kind: rawKind, token } = await params;
  const kind = KINDS[rawKind];
  if (!kind) return new Response("Not found", { status: 404 });
  const r = await resolveEmailToken(kind, token);
  if (r.status === "missing") return new Response("Not found", { status: 404 });
  if (r.status === "expired") return new Response("Link expired", { status: 403 });
  const file = await pdfFor(kind, r.companyId, r.id);
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
