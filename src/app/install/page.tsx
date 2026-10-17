import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { InstallSteps } from "./steps";
import { AdminForm } from "./admin-form";
import { Alert } from "@/components/ui/primitives";
import { installPolicy } from "@/server/install";

export const metadata: Metadata = { title: "Install" };

export default async function InstallPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const policy = installPolicy();
  return (
    <>
      <InstallSteps current={1} />
      <h1 className="text-xl font-semibold">Welcome to Kydi</h1>
      <p className="mt-1 text-sm text-muted">
        Let&apos;s set up your instance. First, create the administrator account. You can invite teammates later.
      </p>
      <ul className="mt-4 space-y-1 text-sm" aria-label="System checks">
        <li className={dbOk ? "text-emerald-700" : "text-red-700"}>
          {dbOk ? "✓ Database connection OK, migrations applied" : "✗ Database unreachable — check DATABASE_URL"}
        </li>
      </ul>
      {policy.ownerEmail ? (
        <div className="mt-4">
          <Alert tone="info" title="Reserved for the owner">
            Only the owner of this deployment can create the administrator account. Use the email address of the account that deployed Kydi.
          </Alert>
        </div>
      ) : null}
      {policy.requireToken ? (
        <div className="mt-4">
          <Alert tone="info" title="Install token required">
            For security, enter the one-time install token from the application log. It is printed when Kydi starts and changes on every restart until installation is complete.
          </Alert>
        </div>
      ) : null}
      <div className="mt-6">
        <AdminForm requireToken={policy.requireToken} />
      </div>
    </>
  );
}
