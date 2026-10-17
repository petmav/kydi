import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/brand";
import { Alert } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/auth/tokens";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  const valid = record && !record.usedAt && record.expiresAt.getTime() > Date.now();
  return (
    <AuthCard title="Choose a new password" subtitle="Use at least 10 characters.">
      {valid ? (
        <ResetForm token={token} />
      ) : (
        <div className="space-y-4">
          <Alert tone="error" title="Link expired">
            This password reset link is invalid or has already been used.
          </Alert>
          <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline focus-ring rounded">
            Request a new link
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
