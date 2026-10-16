import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { markViewed, resolveEmailToken, type DocKind } from "@/server/email";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Document", robots: { index: false } };
export const dynamic = "force-dynamic";

const KINDS: Record<string, DocKind> = { invoices: "invoice", estimates: "estimate", payments: "payment" };

export default async function PublicDocumentPage({ params }: { params: Promise<{ kind: string; token: string }> }) {
  const { kind: rawKind, token } = await params;
  const kind = KINDS[rawKind];
  if (!kind) notFound();
  const r = await resolveEmailToken(kind, token);
  if (r.status === "missing") notFound();
  if (r.status === "expired") {
    return (
      <main id="main" className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="max-w-md rounded-md border border-line bg-white p-8 text-center">
          <h1 className="text-lg font-semibold">Link expired</h1>
          <p className="mt-2 text-sm text-muted">This document link is no longer valid. Please ask the sender for a new copy.</p>
        </div>
      </main>
    );
  }
  if (kind !== "payment") await markViewed(kind, r.id);
  const company = await db.company.findUnique({ where: { id: r.companyId } });
  const label = kind === "invoice" ? "Invoice" : kind === "estimate" ? "Estimate" : "Payment receipt";
  const src = `/customer/${rawKind}/view/${token}/pdf`;
  return (
    <main id="main" className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
        <div>
          <p className="font-semibold">{company?.name}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
        <a href={`${src}?download=1`} className={buttonClass("primary", "sm")}>
          Download PDF
        </a>
      </header>
      <div className="mx-auto max-w-5xl p-4">
        <iframe src={src} title={label} className="h-[85vh] w-full rounded-md border border-line bg-white" />
      </div>
    </main>
  );
}
