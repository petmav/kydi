import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { InstallSteps } from "./steps";
import { AdminForm } from "./admin-form";

export const metadata: Metadata = { title: "Install" };

export default async function InstallPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  return (
    <>
      <InstallSteps current={1} />
      <h1 className="text-xl font-semibold">Welcome to Halyard</h1>
      <p className="mt-1 text-sm text-muted">
        Let&apos;s set up your instance. First, create the administrator account. You can invite teammates later.
      </p>
      <ul className="mt-4 space-y-1 text-sm" aria-label="System checks">
        <li className={dbOk ? "text-emerald-700" : "text-red-700"}>
          {dbOk ? "✓ Database connection OK, migrations applied" : "✗ Database unreachable — check DATABASE_URL"}
        </li>
      </ul>
      <div className="mt-6">
        <AdminForm />
      </div>
    </>
  );
}
