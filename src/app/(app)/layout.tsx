import { AppShell, type NavItem } from "@/components/app-shell";
import { getCompanyContext } from "@/lib/auth/context";
import type { Ability } from "@/lib/abilities";
import { logoutAction } from "../(auth)/actions";
import { switchCompanyAction } from "./actions";

export const dynamic = "force-dynamic";

const NAV: (NavItem & { ability?: Ability })[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", ability: "dashboard.view" },
  { href: "/customers", label: "Customers", icon: "customers", ability: "customers.view" },
  { href: "/items", label: "Items", icon: "items", ability: "items.view" },
  { href: "/estimates", label: "Estimates", icon: "estimates", ability: "estimates.view" },
  { href: "/invoices", label: "Invoices", icon: "invoices", ability: "invoices.view" },
  { href: "/recurring-invoices", label: "Recurring", icon: "recurring", ability: "recurring.view" },
  { href: "/payments", label: "Payments", icon: "payments", ability: "payments.view" },
  { href: "/expenses", label: "Expenses", icon: "expenses", ability: "expenses.view" },
  { href: "/reports", label: "Reports", icon: "reports", ability: "reports.view" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCompanyContext();
  const nav = NAV.filter((n) => !n.ability || ctx.can(n.ability)).map(({ href, label, icon }) => ({ href, label, icon }));
  return (
    <AppShell
      nav={nav}
      companies={ctx.memberships.map((m) => ({ id: m.companyId, name: m.company.name }))}
      currentCompanyId={ctx.companyId}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      canCreateCompany={ctx.user.isSuperAdmin}
      switchAction={switchCompanyAction}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
