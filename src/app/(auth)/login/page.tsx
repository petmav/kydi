import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/brand";
import { Alert } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if ((await db.user.count()) === 0) redirect("/install");
  if (await getSessionUser()) redirect("/dashboard");
  const { next } = await searchParams;
  const demo = env.demoSeed;
  return (
    <AuthCard title="Sign in to Kydi" subtitle="Welcome back. Enter your credentials to continue.">
      {demo ? (
        <div className="mb-5">
          <Alert tone="info" title="Demo instance">
            Sign in as <strong>admin@kydi.test</strong> with password <strong>password123</strong>.
          </Alert>
        </div>
      ) : null}
      <LoginForm next={next} demo={demo} />
    </AuthCard>
  );
}
