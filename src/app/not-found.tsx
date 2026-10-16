import Link from "next/link";
import { Logo } from "@/components/brand";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo className="mb-6 text-2xl" />
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">The page you are looking for doesn&apos;t exist or was moved.</p>
      <Link href="/" className="mt-6 text-sm font-medium text-brand-700 hover:underline focus-ring rounded">
        Go home
      </Link>
    </main>
  );
}
