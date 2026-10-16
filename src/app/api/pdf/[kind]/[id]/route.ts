import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { COMPANY_COOKIE } from "@/lib/auth/context";
import { pdfFor, pdfResponse } from "@/server/pdf";

const ABILITY = { invoice: "view-invoice", estimate: "view-estimate", payment: "view-payment" } as const;

/** Authenticated staff PDF for any document of the active company. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!(kind in ABILITY)) return new Response("Not found", { status: 404 });
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const jar = await cookies();
  const preferred = Number(jar.get(COMPANY_COOKIE)?.value ?? user.lastCompanyId ?? 0);
  const memberships = await db.companyUser.findMany({ where: { userId: user.id }, include: { company: true, role: true }, orderBy: { createdAt: "asc" } });
  const m = memberships.find((x) => x.companyId === preferred) ?? memberships[0];
  if (!m) return new Response("Forbidden", { status: 403 });
  const allowed = m.company.ownerId === user.id || m.role.abilities.includes(ABILITY[kind as keyof typeof ABILITY]);
  if (!allowed) return new Response("Forbidden", { status: 403 });
  const file = await pdfFor(kind as keyof typeof ABILITY, m.companyId, Number(id));
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
