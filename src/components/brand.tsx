import Image from "next/image";
import { cn } from "@/lib/utils";

/** Kydi logo (mark and wordmark). Size it with a height class; the width follows the aspect ratio. */
export function Logo({ className }: { className?: string }) {
  // unoptimized: the file is already web-sized and the standalone image has no image optimizer.
  return <Image src="/brand/kydi-logo.png" alt="Kydi" width={520} height={215} unoptimized priority className={cn("w-auto", className ?? "h-8")} />;
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="mb-6 text-center">
        <Logo className="mx-auto h-14" />
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
