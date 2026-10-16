import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/ui/primitives";
import { getCompanyContext } from "@/lib/auth/context";
import { settingsNavItems } from "./nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCompanyContext();
  return (
    <>
      <PageHeader title="Settings" description={`Configure ${ctx.company.name} and your account.`} />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside>
          <SettingsNav items={settingsNavItems(ctx)} />
        </aside>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </>
  );
}
