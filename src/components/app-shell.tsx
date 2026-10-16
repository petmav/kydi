"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Building2,
  Check,
  ChevronsUpDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  Repeat,
  Settings,
  UserCircle2,
  Users,
  Wallet,
  X,
  FileSignature,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { cn, initials } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  customers: Users,
  items: Package,
  estimates: FileSignature,
  invoices: FileText,
  recurring: Repeat,
  payments: Wallet,
  expenses: Receipt,
  reports: BarChart3,
  settings: Settings,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
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

function CompanySwitcher({
  companies,
  currentId,
  switchAction,
  canCreate,
}: {
  companies: { id: string; name: string }[];
  currentId: string;
  switchAction: (fd: FormData) => Promise<void>;
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const current = companies.find((c) => c.id === currentId);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg border border-line bg-white px-3 py-2 text-left text-sm shadow-sm hover:bg-slate-50 focus-ring"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-100 text-xs font-semibold text-brand-800">
          {initials(current?.name ?? "?")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">Company</span>
          <span className="block truncate font-medium text-ink">{current?.name}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" className="absolute left-0 right-0 z-40 mt-1 rounded-lg border border-line bg-white p-1 shadow-lg">
          {companies.map((c) => (
            <form key={c.id} action={switchAction}>
              <input type="hidden" name="companyId" value={c.id} />
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 focus-ring"
              >
                <Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className="flex-1 truncate">{c.name}</span>
                {c.id === currentId ? <Check className="h-4 w-4 text-brand-600" aria-label="Current company" /> : null}
              </button>
            </form>
          ))}
          {canCreate ? (
            <Link
              href="/companies/new"
              role="menuitem"
              className="mt-1 flex items-center gap-2 border-t border-line px-2 py-2 text-sm text-brand-700 hover:bg-slate-100 focus-ring rounded-md"
              onClick={() => setOpen(false)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> New company
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ name, email, logoutAction }: { name: string; email: string; logoutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      {open ? (
        <div role="menu" className="absolute bottom-full left-0 right-0 z-40 mb-1 rounded-lg border border-line bg-white p-1 shadow-lg">
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-100 focus-ring"
          >
            <UserCircle2 className="h-4 w-4 text-slate-500" aria-hidden="true" /> My profile
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-red-700 hover:bg-red-50 focus-ring"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100 focus-ring"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{name}</span>
          <span className="block truncate text-xs text-muted">{email}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </button>
    </div>
  );
}

export function AppShell({
  nav,
  companies,
  currentCompanyId,
  user,
  canCreateCompany,
  switchAction,
  logoutAction,
  children,
}: {
  nav: NavItem[];
  companies: { id: string; name: string }[];
  currentCompanyId: string;
  user: { name: string; email: string };
  canCreateCompany: boolean;
  switchAction: (fd: FormData) => Promise<void>;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between px-1">
        <Link href="/dashboard" className="rounded-md focus-ring" aria-label="Halyard dashboard">
          <Logo />
        </Link>
        <button
          type="button"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 focus-ring lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <CompanySwitcher
        companies={companies}
        currentId={currentCompanyId}
        switchAction={switchAction}
        canCreate={canCreateCompany}
      />
      <nav aria-label="Main" className="flex-1 overflow-y-auto">
        <ul className="space-y-0.5">
          {nav.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-ring",
                    active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-ink",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active ? "text-brand-600" : "text-slate-400")} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <UserMenu name={user.name} email={user.email} logoutAction={logoutAction} />
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-white lg:block">{sidebar}</aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">{sidebar}</aside>
        </div>
      ) : null}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 focus-ring"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Logo />
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
