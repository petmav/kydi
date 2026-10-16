import type { Metadata } from "next";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Administration" };

/** Platform administration (spec §5.13): read-only overview in v1; management screens are stubs. */
export default async function AdminPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isSuperAdmin) return <Forbidden message="Only the platform administrator can open the administration area." />;
  const [companies, users, docs] = await Promise.all([
    db.company.findMany({ include: { owner: { select: { name: true } }, _count: { select: { members: true } } }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({ include: { memberships: { include: { company: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } }),
    db.invoice.count(),
  ]);
  const df = (d: Date) => formatDate(isoDate(d), ctx.settings.date_format);
  return (
    <>
      <PageHeader title="Administration" description="Installation overview for the platform administrator." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[["Companies", companies.length], ["Users", users.length], ["Invoices", docs]].map(([k, v]) => (
          <Card key={k as string} className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted">{k}</p><p className="tabular text-xl font-semibold">{v}</p></Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Companies" />
          <Table>
            <thead><tr><Th>Name</Th><Th>Owner</Th><Th className="text-right">Members</Th><Th>Created</Th></tr></thead>
            <tbody className="divide-y divide-line">{companies.map((c) => <tr key={c.id}><Td className="font-medium">{c.name}</Td><Td>{c.owner.name}</Td><Td className="tabular text-right">{c._count.members}</Td><Td className="text-muted">{df(c.createdAt)}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Users" />
          <Table>
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Companies</Th></tr></thead>
            <tbody className="divide-y divide-line">{users.map((u) => <tr key={u.id}><Td className="font-medium">{u.name} {u.role === "SUPER_ADMIN" ? <Badge tone="blue">Admin</Badge> : null}</Td><Td className="text-muted">{u.email}</Td><Td className="text-muted">{u.memberships.map((m) => m.company.name).join(", ")}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Not available in this version" />
          <CardBody className="text-sm text-muted">
            Module marketplace, file disks, backups, PDF engine settings, currency management, role-preset editing, impersonation and the self-updater are out of scope for v1. Mail uses the SMTP environment variables; PDFs use the built-in renderer with three templates per document type. Version: 0.1.0.
          </CardBody>
        </Card>
      </div>
    </>
  );
}
