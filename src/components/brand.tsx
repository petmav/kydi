import { cn } from "@/lib/utils";

/** Plain wordmark. */
export function Logo({ className }: { className?: string }) {
  return <span className={cn("text-lg font-bold text-ink", className)}>Halyard</span>;
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="mb-6 text-center">
        <Logo className="text-2xl" />
        <p className="mt-1 text-sm text-muted">Invoicing and billing for small businesses</p>
      </div>
      <div className="w-full max-w-md rounded-md border border-line bg-white p-8 shadow-[var(--shadow-card)]">
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
