import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { mimeFor, readStoredFile } from "@/lib/storage";

/**
 * Authenticated profile photo (spec §3.19: private files go through authorised endpoints).
 * Visible to the user, to anyone sharing a company with them, and to the platform administrator.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const target = await db.user.findUnique({ where: { id }, select: { id: true, avatarPath: true } });
  if (!target?.avatarPath) return new Response("Not found", { status: 404 });
  if (viewer.id !== id && viewer.role !== "SUPER_ADMIN") {
    const shared = await db.companyUser.count({
      where: { userId: id, company: { members: { some: { userId: viewer.id } } } },
    });
    if (!shared) return new Response("Not found", { status: 404 });
  }
  const data = await readStoredFile(target.avatarPath);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFor(target.avatarPath),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
