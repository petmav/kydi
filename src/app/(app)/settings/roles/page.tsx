import type { Metadata } from "next";
import { Badge, Card, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { NewButton, RowActions, RoleFields } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { deleteRoleAction, saveRoleAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Roles" };

const PRESETS = ["owner", "manager", "read-only"];

export default async function RolesPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can manage roles." />;
  const roles = await db.role.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { members: true } } },
  });
  return (
    <Card>
      <CardHeader
        title="Roles"
        description="Control what members can see and do. Selecting an ability automatically selects what it depends on."
        actions={
          <NewButton label="Add role" title="New role" action={saveRoleAction} wide>
            <RoleFields />
          </NewButton>
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Abilities</Th>
            <Th>Members</Th>
            <Th>Added on</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {roles.map((r) => {
            const preset = PRESETS.includes(r.name);
            return (
              <tr key={r.id}>
                <Td className="font-medium">
                  {r.title} {preset ? <Badge tone="gray">Preset</Badge> : null}
                </Td>
                <Td className="text-muted">{r.isOwner ? "All abilities" : `${r.abilities.length} abilities`}</Td>
                <Td className="text-muted">{r._count.members}</Td>
                <Td className="text-muted">{formatDate(r.createdAt.toISOString().slice(0, 10), ctx.settings.date_format)}</Td>
                <Td>
                  {preset ? (
                    <span className="block text-right text-xs text-muted">View only</span>
                  ) : (
                    <RowActions
                      wide
                      editTitle={`Edit ${r.title}`}
                      editAction={saveRoleAction}
                      editFields={<RoleFields role={r} />}
                      deleteAction={deleteRoleAction.bind(null, r.id)}
                      deleteTitle={`Delete ${r.title}?`}
                      deleteDescription="Roles assigned to members cannot be deleted."
                    />
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
