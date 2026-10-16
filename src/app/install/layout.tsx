import { Logo } from "@/components/brand";

export const dynamic = "force-dynamic";

export default function InstallLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center px-4 py-12">
      <Logo className="mb-6 text-2xl" />
      <div className="w-full max-w-xl rounded-md border border-line bg-white p-8 shadow-[var(--shadow-card)]">{children}</div>
      <p className="mt-6 text-xs text-muted">Halyard · open-source invoicing · MIT licensed</p>
    </main>
  );
}
