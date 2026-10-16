import type { Metadata } from "next";
import Link from "next/link";
import { getPortalCompany } from "@/lib/auth/portal";
import { portalForgotAction } from "../../actions";
import { PortalForgotForm } from "../../forms";
import { PortalCard } from "../portal-card";

export const metadata: Metadata = { title: "Reset portal password" };

export default async function PortalForgotPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getPortalCompany(slug);
  return (
    <PortalCard title={`Reset your ${company.name} portal password`}>
      <PortalForgotForm action={portalForgotAction.bind(null, slug)} />
      <p className="mt-6 text-center text-sm"><Link href={`/portal/${slug}/login`} className="text-brand-700 hover:underline">Back to sign in</Link></p>
    </PortalCard>
  );
}
