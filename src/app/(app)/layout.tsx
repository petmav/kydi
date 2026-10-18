import { AppShell, type NavItem, type QuickCreate } from "@/components/app-shell";
import { getCompanyContext } from "@/lib/auth/context";
import type { Ability } from "@/lib/abilities";
import { logoutAction } from "../(auth)/actions";
import { switchCompanyAction } from "./actions";
import ProductTour from "@/components/product_tour";
import { settingsNavItems } from "./settings/nav";

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
  { group: "Main", href: "/cash-flow", label: "Cash-flow forecast", icon: "reports", ability: "dashboard" },
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
  const quickCreate = QUICK.filter((q) => ctx.can(q.ability)).map(({ href, label }) => ({ href, label }));
  const availableTourPaths = [
    ...nav.map((item) => item.href),
    ...settingsNavItems(ctx).map((item) => item.href),
    ...(ctx.can("view-recurring-invoice") ? ["/recurring-invoices"] : []),
    ...(ctx.can("create-item") ? ["/items/new"] : []),
    ...(ctx.can("create-customer") ? ["/customers/new"] : []),
    ...(ctx.can("create-estimate") ? ["/estimates/new"] : []),
    ...(ctx.can("create-invoice") ? ["/invoices/new"] : []),
    ...(ctx.can("create-recurring-invoice") ? ["/recurring-invoices/new"] : []),
    ...(ctx.can("create-payment") ? ["/payments/new"] : []),
    ...(ctx.can("create-expense") ? ["/expenses/new"] : []),
    ...(ctx.can("dashboard") || ctx.can("view-financial-reports") ? ["/cash-flow", "/anomalies"] : []),
    ...(ctx.isSuperAdmin ? ["/admin"] : []),
    ...(ctx.isSuperAdmin ? ["/admin"] : []),
    ...(ctx.isSuperAdmin || ctx.memberships.some((m) => m.company.ownerId === ctx.user.id) ? ["/companies/new"] : []),
  ];
  return (
    <AppShell
      nav={nav}
      quickCreate={quickCreate}
      companies={ctx.memberships.map((m) => ({ id: m.companyId, name: m.company.name }))}
      currentCompanyId={ctx.companyId}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      canCreateCompany={ctx.isSuperAdmin || ctx.memberships.some((m) => m.company.ownerId === ctx.user.id)}
      isAdmin={ctx.isSuperAdmin}
      switchAction={switchCompanyAction}
      logoutAction={logoutAction}
    >
      <ProductTour userId={ctx.user.id} availableTourPaths={[...new Set(availableTourPaths)]} />
      {children}
    </AppShell>
  );
}
