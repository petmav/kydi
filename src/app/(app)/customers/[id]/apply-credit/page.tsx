import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { ApplyCreditForm } from "@/components/payments/apply-credit-form";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { creditPayments, openInvoices } from "@/server/payments";
import { applyCreditAction } from "../../../payments/actions";

export const metadata: Metadata = { title: "Apply credit" };

export default async function ApplyCreditPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("edit-payment")) return <Forbidden />;
  const id = parseId((await params).id);
  const c = await db.customer.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!c) notFound();
  const [payments, invoices] = await Promise.all([creditPayments(ctx.companyId, c.id), openInvoices(ctx.companyId, c.id)]);
  return (
    <>
      <PageHeader title={`Apply credit — ${c.name}`} description="Use unapplied payments to settle open invoices." back={<Link href={`/customers/${c.id}`} className="text-brand-700 hover:underline focus-ring rounded">← {c.name}</Link>} />
      <ApplyCreditForm action={applyCreditAction.bind(null, c.id)} payments={payments} invoices={invoices.filter((i) => i.available > 0)} currency={c.currency} locale={ctx.settings.locale} cancelHref={`/customers/${c.id}`} />
    </>
  );
}
