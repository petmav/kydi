import { AppShell, type NavItem, type QuickCreate } from "@/components/app-shell";
import { getCompanyContext } from "@/lib/auth/context";
import type { Ability } from "@/lib/abilities";
import { logoutAction } from "../(auth)/actions";
import { switchCompanyAction } from "./actions";
import { pendingInvitationsFor } from "@/server/team";
import { respondInvitationAction } from "../invitations/actions";
import { buttonClass } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type Entry = NavItem & { ability?: Ability; ownerOnly?: boolean };

const NAV: Entry[] = [
  { group: "Main", href: "/dashboard", label: "Dashboard", icon: "dashboard", ability: "dashboard" },
  { group: "Main", href: "/items", label: "Items", icon: "items", ability: "view-item" },
  { group: "Sales", href: "/customers", label: "Customers", icon: "customers", ability: "view-customer" },
  { group: "Sales", href: "/estimates", label: "Estimates", icon: "estimates", ability: "view-estimate" },
  { group: "Sales", href: "/invoices", label: "Invoices", icon: "invoices", ability: "view-invoice", match: ["/recurring-invoices"] },
  { group: "Sales", href: "/payments", label: "Payments", icon: "payments", ability: "view-payment" },
  { group: "Purchases", href: "/expenses", label: "Expenses", icon: "expenses", ability: "view-expense" },
  { group: "Purchases", href: "/purchases", label: "Suppliers & bills", icon: "purchases", ability: "view-expense" },
  { group: "Admin", href: "/members", label: "Members", icon: "members", ownerOnly: true },
  { group: "Admin", href: "/reports", label: "Reports", icon: "reports", ability: "view-financial-reports" },
  { group: "Admin", href: "/settings", label: "Settings", icon: "settings" },
];

const QUICK: (QuickCreate & { ability: Ability })[] = [
  { href: "/invoices/new", label: "Invoice", ability: "create-invoice" },
  { href: "/estimates/new", label: "Estimate", ability: "create-estimate" },
  { href: "/payments/new", label: "Payment", ability: "create-payment" },
  { href: "/customers/new", label: "Customer", ability: "create-customer" },
  { href: "/expenses/new", label: "Expense", ability: "create-expense" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCompanyContext();
  const nav: NavItem[] = NAV.filter((n) => (n.ownerOnly ? ctx.isOwner : !n.ability || ctx.can(n.ability))).map((n) => ({
    href: n.href,
    label: n.label,
    icon: n.icon,
    group: n.group,
    match: n.match,
  }));
  const invitations = await pendingInvitationsFor(ctx.user.email);
  const quickCreate = QUICK.filter((q) => ctx.can(q.ability)).map(({ href, label }) => ({ href, label }));
  return (
    <AppShell
      nav={nav}
      quickCreate={quickCreate}
      companies={ctx.memberships.map((m) => ({ id: m.companyId, name: m.company.name }))}
      currentCompanyId={ctx.companyId}
      user={{ name: ctx.user.name, email: ctx.user.email, avatarUrl: ctx.user.avatarPath ? `/api/files/avatar/${ctx.user.id}?v=${ctx.user.updatedAt.getTime()}` : null }}
      canCreateCompany={ctx.isSuperAdmin || ctx.memberships.some((m) => m.company.ownerId === ctx.user.id)}
      isAdmin={ctx.isSuperAdmin}
      switchAction={switchCompanyAction}
      logoutAction={logoutAction}
    >
      {invitations.length > 0 ? (
        <section aria-label="Pending invitations" className="mb-6 space-y-2">
          {invitations.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
              <p>
                You are invited to join <strong>{inv.company.name}</strong> as {inv.role.title}.
              </p>
              <div className="flex gap-2">
                <form action={respondInvitationAction.bind(null, inv.token, true)}>
                  <button type="submit" className={buttonClass("primary", "sm")}>Accept</button>
                </form>
                <form action={respondInvitationAction.bind(null, inv.token, false)}>
                  <button type="submit" className={buttonClass("secondary", "sm")}>Decline</button>
                </form>
              </div>
            </div>
          ))}
        </section>
      ) : null}
      {children}
    </AppShell>
  );
}
