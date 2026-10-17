import { PageHeader } from "@/components/ui/primitives";
import { requirePortalCustomer } from "@/lib/auth/portal";
import { db } from "@/lib/db";
import { portalProfileAction } from "../../actions";
import { PortalProfileForm } from "../../forms";

export default async function PortalSettings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { customer } = await requirePortalCustomer(slug);
  // The hash itself is never loaded (src/lib/db.ts); only whether one exists.
  const hasPassword = (await db.customer.count({ where: { id: customer.id, portalPasswordHash: { not: null } } })) > 0;
  const rest = customer;
  const profile = Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v === "string" || v === null)) as Record<string, string | null>;
  return (
    <>
      <PageHeader title="Settings" description="Your contact details and portal password." />
      <PortalProfileForm action={portalProfileAction.bind(null, slug)} profile={profile} hasPassword={hasPassword} />
    </>
  );
}
