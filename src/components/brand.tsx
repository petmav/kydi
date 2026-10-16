import { cn } from "@/lib/utils";

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-brand-600" />
        <path d="M16 6v20M16 6l8 13H16M16 9l-6 10h6" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none" />
        <path d="M8 23h16l-2.5 3h-11z" fill="white" />
      </svg>
      {showText ? <span className="text-lg font-semibold tracking-tight text-ink">Halyard</span> : null}
    </span>
  );
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Logo className="mb-8" />
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-[var(--shadow-card)]">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
