import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/dates";
import { pendingInvitationsFor } from "@/server/team";
import { respondInvitationAction } from "../invitations/actions";
import { logoutAction } from "../(auth)/actions";

export const metadata: Metadata = { title: "No company" };
export const dynamic = "force-dynamic";

/** Spec §5.10 / §5.14: a signed-in user without memberships sees pending invitations and, if allowed, "Create company". */
export default async function NoCompanyPage({ searchParams }: { searchParams: Promise<{ stay?: string }> }) {
  const user = await requireUser();
  if ((await db.companyUser.count({ where: { userId: user.id } })) > 0) redirect("/dashboard");
  const invitations = await pendingInvitationsFor(user.email);
  // Spec §2.2: the platform administrator without a company lands in the Administration area.
  if (user.role === "SUPER_ADMIN" && invitations.length === 0 && (await searchParams).stay !== "1") redirect("/admin");
  const inviters = new Map(
    (await db.user.findMany({ where: { id: { in: invitations.map((i) => i.invitedById) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const isAdmin = user.role === "SUPER_ADMIN";
  return (
    <main id="main" className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo className="h-10" />
          <form action={logoutAction}>
            <button type="submit" className={buttonClass("ghost", "sm")}>
              Sign out
            </button>
          </form>
        </div>
        <Card>
          <CardHeader title="You are not a member of any company" description={`Signed in as ${user.email}.`} />
          <CardBody className="space-y-5">
            {invitations.length === 0 ? (
              <Alert tone="info">You have no pending invitations. Ask a company owner to invite {user.email}, or create your own company.</Alert>
            ) : (
              <div>
                <h2 className="mb-2 text-sm font-semibold text-ink">Pending invitations</h2>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {invitations.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-ink">{inv.company.name}</p>
                        <p className="text-muted">
                          Role: {inv.role.title} · Invited by {inviters.get(inv.invitedById) ?? "a former member"} · Expires {formatDate(isoDate(inv.expiresAt), "yyyy-MM-dd")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <form action={respondInvitationAction.bind(null, inv.token, true)}>
                          <button type="submit" className={buttonClass("primary", "sm")}>
                            Accept
                          </button>
                        </form>
                        <form action={respondInvitationAction.bind(null, inv.token, false)}>
                          <button type="submit" className={buttonClass("secondary", "sm")}>
                            Decline
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Link href="/install/company" className={buttonClass("secondary")}>
                Create a company
              </Link>
              {isAdmin ? (
                <Link href="/admin" className={buttonClass("secondary")}>
                  Open administration
                </Link>
              ) : null}
            </div>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
