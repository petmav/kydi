import Link from "next/link";
import { requirePortalCustomer } from "@/lib/auth/portal";
import { getCompanySettings } from "@/lib/settings";
import { portalLogoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { customer, company } = await requirePortalCustomer(slug);
  const title = (await getCompanySettings(company.id)).customer_portal_page_title || company.name;
  const nav = [
    ["", "Dashboard"],
    ["/invoices", "Invoices"],
    ["/estimates", "Estimates"],
    ["/payments", "Payments"],
    ["/settings", "Settings"],
  ];
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-bold">{title}</span>
          <nav aria-label="Portal" className="flex flex-wrap gap-1">
            {nav.map(([href, label]) => (
              <Link key={href} href={`/portal/${slug}${href}`} className="rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-subtle focus-ring">{label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted">{customer.name}</span>
            <form action={portalLogoutAction.bind(null, slug)}>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-subtle focus-ring">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
