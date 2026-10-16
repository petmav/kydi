import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { COMPANY_COOKIE } from "@/lib/auth/context";
import { mimeFor, readStoredFile } from "@/lib/storage";

/** Authenticated, company-scoped receipt download (spec §3.19). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const jar = await cookies();
  const memberships = await db.companyUser.findMany({ where: { userId: user.id }, include: { company: true, role: true } });
  const preferred = Number(jar.get(COMPANY_COOKIE)?.value ?? user.lastCompanyId ?? 0);
  const m = memberships.find((x) => x.companyId === preferred) ?? memberships[0];
  if (!m || (m.company.ownerId !== user.id && !m.role.abilities.includes("view-expense"))) return new Response("Forbidden", { status: 403 });
  const e = await db.expense.findFirst({ where: { id: Number((await params).id), companyId: m.companyId } });
  if (!e?.receiptPath) return new Response("Not found", { status: 404 });
  const data = await readStoredFile(e.receiptPath);
  if (!data) return new Response("Not found", { status: 404 });
  const name = (e.receiptName ?? "receipt").replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFor(e.receiptPath),
      "Content-Disposition": `inline; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'",
      "Cache-Control": "private, no-store",
    },
  });
}
