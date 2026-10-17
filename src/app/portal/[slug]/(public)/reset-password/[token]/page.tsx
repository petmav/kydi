import type { Metadata } from "next";
import { getPortalCompany } from "@/lib/auth/portal";
import { portalResetAction } from "../../../actions";
import { PortalResetForm } from "../../../forms";
import { PortalCard } from "../../portal-card";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ setup?: string }> }): Promise<Metadata> {
  return { title: (await searchParams).setup === "1" ? "Set up your portal access" : "Choose a new password" };
}

export default async function PortalResetPage({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ setup?: string }> }) {
  const { slug, token } = await params;
  const setup = (await searchParams).setup === "1";
  const company = await getPortalCompany(slug);
  return (
    <PortalCard title={setup ? "Set up your portal access" : "Choose a new password"} subtitle={setup ? `Choose a password for the ${company.name} customer portal. Use at least 10 characters.` : "Use at least 10 characters."}>
      <PortalResetForm action={portalResetAction.bind(null, slug)} token={token} submitLabel={setup ? "Set password" : "Update password"} />
    </PortalCard>
  );
}
