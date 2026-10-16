import { db } from "@/lib/db";
import { mimeFor, readStoredFile } from "@/lib/storage";

/** Public company logo (logos are intentionally public, spec §3.19). */
export async function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const company = await db.company.findUnique({ where: { uniqueHash: hash }, select: { logoPath: true } });
  if (!company?.logoPath) return new Response("Not found", { status: 404 });
  const data = await readStoredFile(company.logoPath);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeFor(company.logoPath),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
