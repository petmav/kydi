import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/brand";
import { Alert } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { respondInvitationAction } from "../actions";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Invitation" };
export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await db.invitation.findUnique({ where: { token }, include: { company: true, role: true } });
  const valid = inv && inv.status === "PENDING" && inv.expiresAt > new Date();
  if (!inv || !valid) {
    return (
      <AuthCard title="Invitation unavailable">
        <Alert tone="error">This invitation has expired, was cancelled or has already been answered.</Alert>
      </AuthCard>
    );
  }
  const user = await getSessionUser();
  const account = await db.user.findUnique({ where: { email: inv.email }, select: { id: true } });
  return (
    <AuthCard title={`Join ${inv.company.name}`} subtitle={`You were invited as ${inv.role.title} (${inv.email}).`}>
      {user && user.email === inv.email ? (
        <div className="flex gap-2">
          <form action={respondInvitationAction.bind(null, token, true)}>
            <button type="submit" className={buttonClass("primary")}>
              Accept invitation
            </button>
          </form>
          <form action={respondInvitationAction.bind(null, token, false)}>
            <button type="submit" className={buttonClass("secondary")}>
              Decline
            </button>
          </form>
        </div>
      ) : user ? (
        <Alert tone="warning">You are signed in as {user.email}. Sign out and sign in as {inv.email} to answer this invitation.</Alert>
      ) : account ? (
        <Link href={`/login?next=/invitations/${token}`} className={buttonClass("primary")}>
          Sign in to accept
        </Link>
      ) : (
        <RegisterForm token={token} email={inv.email} />
      )}
    </AuthCard>
  );
}
