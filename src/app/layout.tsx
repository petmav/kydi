import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/toast";
import "./globals.css";


export const metadata: Metadata = {
  title: { default: "Halyard", template: "%s · Halyard" },
  description: "Invoicing, estimates, payments and expenses for small businesses.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen antialiased`}>
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
