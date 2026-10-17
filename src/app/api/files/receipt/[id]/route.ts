import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { COMPANY_COOKIE } from "@/lib/auth/context";
import { contentDisposition, extensionOf, INLINE_EXTENSIONS, mimeFor, readStoredFile } from "@/lib/storage";

/** Authenticated, company-scoped receipt download (spec §3.19). Office documents are always downloaded. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const jar = await cookies();
  const memberships = await db.companyUser.findMany({ where: { userId: user.id }, include: { company: true, role: true }, orderBy: { createdAt: "asc" } });
  const preferred = Number(jar.get(COMPANY_COOKIE)?.value ?? user.lastCompanyId ?? 0);
  const m = memberships.find((x) => x.companyId === preferred) ?? memberships[0];
  if (!m || (m.company.ownerId !== user.id && !m.role.abilities.includes("view-expense"))) return new Response("Forbidden", { status: 403 });
  const e = await db.expense.findFirst({ where: { id, companyId: m.companyId } });
  if (!e?.receiptPath) return new Response("Not found", { status: 404 });
  const data = await readStoredFile(e.receiptPath);
  if (!data) return new Response("Not found", { status: 404 });
  const inline = INLINE_EXTENSIONS.includes(extensionOf(e.receiptPath));
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFor(e.receiptPath),
      "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", e.receiptName ?? `receipt.${extensionOf(e.receiptPath)}`),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'self'",
      "Cache-Control": "private, no-store",
    },
  });
}
