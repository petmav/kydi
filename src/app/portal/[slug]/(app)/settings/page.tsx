import { PageHeader } from "@/components/ui/primitives";
import { requirePortalCustomer } from "@/lib/auth/portal";
import { portalProfileAction } from "../../actions";
import { PortalProfileForm } from "../../forms";

export default async function PortalSettings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { customer } = await requirePortalCustomer(slug);
  const { portalPasswordHash: _h, ...rest } = customer;
  void _h;
  const profile = Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v === "string" || v === null)) as Record<string, string | null>;
  return (
    <>
      <PageHeader title="Settings" description="Your contact details and portal password." />
      <div data-tour="portal-settings">
        <PortalProfileForm action={portalProfileAction.bind(null, slug)} profile={profile} />
      </div>
    </>
  );
}
