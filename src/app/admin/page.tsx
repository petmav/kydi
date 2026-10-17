import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { APP_VERSION } from "@/lib/version";

export const metadata: Metadata = { title: "Administration" };

/** Admin dashboard (spec §5.13): installation counters and app version. */
export default async function AdminPage() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") return null;
  const [companies, users, invoices, estimates, payments] = await Promise.all([
    db.company.count(),
    db.user.count(),
    db.invoice.count(),
    db.estimate.count(),
    db.payment.count(),
  ]);
  const counters: [string, number, string][] = [
    ["Companies", companies, "/admin/companies"],
    ["Users", users, "/admin/users"],
    ["Documents", invoices + estimates + payments, ""],
  ];
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-ink">Overview</h1>
        <p className="mt-1 text-sm text-muted">Installation-wide figures for the platform administrator.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {counters.map(([k, v, href]) => (
          <Card key={k} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{k}</p>
            <p className="tabular text-xl font-semibold">{v}</p>
            {href ? (
              <Link href={href} className="text-xs text-brand-700 hover:underline focus-ring rounded">
                Manage
              </Link>
            ) : (
              <p className="text-xs text-muted">
                {invoices} invoices, {estimates} estimates, {payments} payments
              </p>
            )}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Application" />
        <CardBody>
          <DescriptionList
            items={[
              { label: "Version", value: APP_VERSION },
              { label: "PDF engine", value: "Built-in renderer (three templates per document type)" },
              { label: "File storage", value: "Local disk (UPLOAD_DIR)" },
              { label: "Runtime", value: `Node.js ${process.version}` },
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}
