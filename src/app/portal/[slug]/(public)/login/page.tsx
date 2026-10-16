import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalCompany, getPortalCustomer } from "@/lib/auth/portal";
import { getCompanySettings } from "@/lib/settings";
import { portalLoginAction } from "../../actions";
import { PortalLoginForm } from "../../forms";
import { PortalCard } from "../portal-card";

export const metadata: Metadata = { title: "Customer portal" };
export const dynamic = "force-dynamic";

export default async function PortalLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getPortalCompany(slug);
  if (await getPortalCustomer(slug)) redirect(`/portal/${slug}`);
  const title = (await getCompanySettings(company.id)).customer_portal_page_title || company.name;
  return (
    <PortalCard title={title} subtitle="Sign in to view your invoices, estimates and payments.">
      <PortalLoginForm action={portalLoginAction.bind(null, slug)} slug={slug} />
    </PortalCard>
  );
}
