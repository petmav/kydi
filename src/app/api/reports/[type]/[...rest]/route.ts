import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { COMPANY_COOKIE } from "@/lib/auth/context";
import { parseIsoDate } from "@/lib/dates";
import { pdfResponse, renderSimplePdf } from "@/server/pdf";
import { buildReport, buildStatement, REPORT_TYPES, type ReportType } from "@/server/reports";

/**
 * GET /api/reports/<type>/pdf?from&to[&category][&download]  (type in REPORT_TYPES)
 * GET /api/reports/statement/<customerId>?type=activity|outstanding&from&to
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string; rest: string[] }> }) {
  const { type, rest } = await params;
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const jar = await cookies();
  const memberships = await db.companyUser.findMany({ where: { userId: user.id }, include: { company: true, role: true } });
  const preferred = Number(jar.get(COMPANY_COOKIE)?.value ?? user.lastCompanyId ?? 0);
  const m = memberships.find((x) => x.companyId === preferred) ?? memberships[0];
  if (!m) return new Response("Forbidden", { status: 403 });
  const owner = m.company.ownerId === user.id;
  const url = new URL(req.url);
  const q = (k: string) => url.searchParams.get(k) ?? "";
  const download = url.searchParams.has("download");
  const from = q("from");
  const to = q("to") || q("as_of");

  if (type === "statement") {
    if (!owner && !m.role.abilities.includes("view-customer")) return new Response("Forbidden", { status: 403 });
    if (!parseIsoDate(to) || (q("type") !== "outstanding" && !parseIsoDate(from))) return new Response("from/to required", { status: 422 });
    const customerId = Number(rest[0]);
    if (!Number.isInteger(customerId) || customerId <= 0) return new Response("Not found", { status: 404 });
    const d = await buildStatement(m.companyId, customerId, q("type") === "outstanding" ? "outstanding" : "activity", from, to);
    if (!d) return new Response("Not found", { status: 404 });
    return pdfResponse({ buffer: await renderSimplePdf(d), filename: `statement-${rest[0]}.pdf` }, download);
  }
  if (!(REPORT_TYPES as readonly string[]).includes(type)) return new Response("Not found", { status: 404 });
  if (!owner && !m.role.abilities.includes("view-financial-reports")) return new Response("Forbidden", { status: 403 });
  if (!parseIsoDate(from) || !parseIsoDate(to) || to < from) return new Response("Valid from_date and to_date are required (to >= from).", { status: 422 });
  const d = await buildReport(m.companyId, type as ReportType, from, to, { categoryId: Number(q("category")) || undefined });
  return pdfResponse({ buffer: await renderSimplePdf(d), filename: `${type}-${from}-${to}.pdf` }, download);
}
