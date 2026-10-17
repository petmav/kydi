import type { Metadata } from "next";
import { getPortalCompany } from "@/lib/auth/portal";
import { portalResetAction } from "../../../actions";
import { PortalResetForm } from "../../../forms";
import { PortalCard } from "../../portal-card";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function PortalResetPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  await getPortalCompany(slug);
  return (
    <PortalCard title="Choose a new password" subtitle="Use at least 10 characters.">
      <PortalResetForm action={portalResetAction.bind(null, slug)} token={token} />
    </PortalCard>
  );
}
