"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  FileSignature,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  Settings,
  ShoppingCart,
  UserCircle2,
  Users,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { cn, initials } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  customers: Users,
  items: Package,
  estimates: FileSignature,
  invoices: FileText,
  payments: Wallet,
  expenses: Receipt,
  purchases: ShoppingCart,
  members: UsersRound,
  reports: BarChart3,
  settings: Settings,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; group: string; match?: string[] };
export type QuickCreate = { href: string; label: string };

function isActive(pathname: string, item: NavItem) {
  return [item.href, ...(item.match ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}

function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

function Dropdown({
  label,
  button,
  children,
  align = "right",
}: {
  label: string;
  button: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(ref, open, close);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        data-tour={label === "Switch company" ? "company-switcher" : label === "Create new" ? "quick-create" : label === "User menu" ? "account-menu" : undefined}
        className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm text-ink-2 hover:bg-subtle focus-ring"
      >
        {button}
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className={cn("absolute z-40 mt-1 min-w-56 rounded-md border border-line bg-white p-1 shadow-lg", align === "right" ? "right-0" : "left-0")}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

const menuItem = "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-ink-2 hover:bg-subtle focus-ring";

export function AppShell({
  nav,
  quickCreate,
  companies,
  currentCompanyId,
  user,
  canCreateCompany,
  isAdmin = false,
  switchAction,
  logoutAction,
  children,
}: {
  nav: NavItem[];
  quickCreate: QuickCreate[];
  companies: { id: number; name: string }[];
  currentCompanyId: number;
  user: { name: string; email: string };
  canCreateCompany: boolean;
  isAdmin?: boolean;
  switchAction: (fd: FormData) => Promise<void>;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [pathname]);
  const current = companies.find((c) => c.id === currentCompanyId);
  const groups = [...new Set(nav.map((n) => n.group))];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between border-b border-line px-5">
        <Link href="/dashboard" className="rounded focus-ring" aria-label="Kydi dashboard">
          <Logo />
        </Link>
        <button
          type="button"
          className="rounded p-1.5 text-slate-500 hover:bg-subtle focus-ring lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <nav aria-label="Main" data-tour="main-navigation" className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g} className="mb-4">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g}</p>
            <ul className="space-y-0.5">
              {nav
                .filter((n) => n.group === g)
                .map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        data-tour-nav={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm focus-ring",
                          active ? "bg-brand-50 font-medium text-brand-800" : "text-ink-2 hover:bg-subtle hover:text-ink",
                        )}
                      >
                        <Icon className={cn("h-4 w-4", active ? "text-brand-700" : "text-slate-400")} aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-white lg:block">{sidebar}</aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">{sidebar}</aside>
        </div>
      ) : null}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white px-4 sm:px-6">
        <button
          type="button"
          className="rounded p-1.5 text-slate-600 hover:bg-subtle focus-ring lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Dropdown
          label="Switch company"
          align="left"
          button={
            <>
              <Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span className="max-w-[12rem] truncate font-medium text-ink">{current?.name}</span>
            </>
          }
        >
          {(close) => (
            <>
              <p className="px-2 py-1 text-xs font-medium text-muted">Companies</p>
              {companies.map((c) => (
                <form key={c.id} action={switchAction}>
                  <input type="hidden" name="companyId" value={c.id} />
                  <button type="submit" role="menuitem" className={menuItem}>
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.id === currentCompanyId ? <Check className="h-4 w-4 text-brand-700" aria-label="Current company" /> : null}
                  </button>
                </form>
              ))}
              {canCreateCompany ? (
                <Link href="/companies/new" role="menuitem" className={cn(menuItem, "mt-1 border-t border-line text-brand-700")} onClick={close}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add company
                </Link>
              ) : null}
            </>
          )}
        </Dropdown>
        <div className="ml-auto flex items-center gap-2">
          {quickCreate.length > 0 ? (
            <Dropdown
              label="Create new"
              button={
                <>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">New</span>
                </>
              }
            >
              {(close) =>
                quickCreate.map((q) => (
                  <Link key={q.href} href={q.href} role="menuitem" className={menuItem} onClick={close}>
                    {q.label}
                  </Link>
                ))
              }
            </Dropdown>
          ) : null}
          <Dropdown
            label="User menu"
            button={
              <>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-white">{initials(user.name)}</span>
                <span className="hidden max-w-[10rem] truncate md:inline">{user.name}</span>
              </>
            }
          >
            {(close) => (
              <>
                <div className="border-b border-line px-2 py-2">
                  <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </div>
                <Link href="/profile" role="menuitem" className={cn(menuItem, "mt-1")} onClick={close}>
                  <UserCircle2 className="h-4 w-4 text-slate-500" aria-hidden="true" /> Account settings
                </Link>
                {isAdmin ? (
                  <Link href="/admin" role="menuitem" className={menuItem} onClick={close}>
                    <Settings className="h-4 w-4 text-slate-500" aria-hidden="true" /> Administration
                  </Link>
                ) : null}
                <form action={logoutAction}>
                  <button type="submit" role="menuitem" className={cn(menuItem, "text-red-700 hover:bg-red-50")}>
                    <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
                  </button>
                </form>
              </>
            )}
          </Dropdown>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
