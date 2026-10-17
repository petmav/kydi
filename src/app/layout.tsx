import type { Metadata } from "next";
import { headers } from "next/headers";
import { Toaster } from "@/components/toast";
import "./globals.css";


export const metadata: Metadata = {
  title: { default: "Kydi", template: "%s · Kydi" },
  description: "Invoicing, estimates, payments and expenses for small businesses.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Reading request headers renders every page per request, so Next.js can apply the CSP nonce set by the
  // middleware to its scripts (statically prerendered pages would carry no nonce and be blocked).
  await headers();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only z-[70] rounded-md bg-white px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
