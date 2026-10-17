import Link from "next/link";
import { Logo } from "@/components/brand";
import { SettingsNav } from "@/components/settings/settings-nav";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { logoutAction } from "../(auth)/actions";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/role-presets", label: "Role presets" },
  { href: "/admin/mail", label: "Mail configuration" },
  { href: "/admin/modules", label: "Modules" },
  { href: "/admin/system", label: "System" },
];

/** Administration area (spec §5.13): platform admin only, reachable without a company membership. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const hasCompany = (await db.companyUser.count({ where: { userId: user.id } })) > 0;
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white px-4 sm:px-6">
        <Link href="/admin" className="rounded focus-ring">
          <Logo />
        </Link>
        <span className="text-sm text-muted">Administration</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href={hasCompany ? "/dashboard" : "/no-company?stay=1"} className={buttonClass("secondary", "sm")}>
            Back to the app
          </Link>
          <form action={logoutAction}>
            <button type="submit" className={buttonClass("ghost", "sm")}>
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {user.role !== "SUPER_ADMIN" ? (
          <Card>
            <EmptyState title="You don't have access to this page" description="Only the platform administrator can open the administration area." />
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
            <aside>
              <SettingsNav items={NAV} exact={["/admin"]} />
            </aside>
            <div className="min-w-0 space-y-6">{children}</div>
          </div>
        )}
      </main>
    </div>
  );
}
