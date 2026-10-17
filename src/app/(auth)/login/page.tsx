import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/brand";
import { Alert } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/server/demo-credentials";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if ((await db.user.count()) === 0) redirect("/install");
  if (await getSessionUser()) redirect("/dashboard");
  const { next } = await searchParams;
  // Demo credentials are shown only when demo data was explicitly requested; pre-filling is development-only.
  const demo = env.demoSeed;
  const prefill = demo && !env.isProduction ? { email: DEMO_EMAIL, password: DEMO_PASSWORD } : undefined;
  return (
    <AuthCard title="Sign in to Kydi" subtitle="Welcome back. Enter your credentials to continue.">
      {demo ? (
        <div className="mb-5">
          <Alert tone="info" title="Demo instance">
            Sign in as <strong>{DEMO_EMAIL}</strong> with password <strong>{DEMO_PASSWORD}</strong>.
          </Alert>
        </div>
      ) : null}
      <LoginForm next={next} prefill={prefill} />
    </AuthCard>
  );
}
