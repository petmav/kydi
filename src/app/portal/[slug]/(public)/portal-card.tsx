export function PortalCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md rounded-md border border-line bg-white p-8 shadow-[var(--shadow-card)]">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Customer portal</p>
        <h1 className="mt-1 text-lg font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-6 text-xs text-muted">Powered by Kydi</p>
    </main>
  );
}
