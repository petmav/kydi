import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/brand";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" subtitle="Enter your account email and we'll send you a reset link.">
      <ForgotForm />
      <p className="mt-6 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline focus-ring rounded">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
