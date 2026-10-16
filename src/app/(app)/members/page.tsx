import type { Metadata } from "next";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { Field, SelectField } from "@/components/form";
import { NewButton, RowActions } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/dates";
import { addMemberAction, cancelInvitationAction, inviteMemberAction, removeMemberAction, updateMemberRoleAction } from "./actions";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can manage members." />;
  const [members, invitations, roles] = await Promise.all([
    db.companyUser.findMany({ where: { companyId: ctx.companyId }, include: { user: true, role: true }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { companyId: ctx.companyId, status: "PENDING" }, include: { role: true }, orderBy: { createdAt: "desc" } }),
    db.role.findMany({ where: { companyId: ctx.companyId }, orderBy: { createdAt: "asc" } }),
  ]);
  const inviters = new Map((await db.user.findMany({ where: { id: { in: invitations.map((i) => i.invitedById) } } })).map((u) => [u.id, u.name]));
  const roleOptions = roles.filter((r) => !r.isOwner).map((r) => ({ value: String(r.id), label: r.title }));
  const df = ctx.settings.date_format;
  return (
    <>
      <PageHeader
        title="Members"
        description={`People who can access ${ctx.company.name}.`}
        actions={
          <>
            <NewButton label="Invite member" title="Invite member" action={inviteMemberAction}>
              <Field name="email" label="Email" type="email" required autoFocus />
              <SelectField name="roleId" label="Role" required options={roleOptions} defaultValue={roleOptions[0]?.value} />
            </NewButton>
            <NewButton label="Add member" title="Add member" action={addMemberAction}>
              <Field name="name" label="Name" required autoFocus />
              <Field name="email" label="Email" type="email" required />
              <Field name="phone" label="Phone" type="tel" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="password" label="Password" type="password" required autoComplete="new-password" />
                <Field name="confirm" label="Confirm password" type="password" required autoComplete="new-password" />
              </div>
              <SelectField name="roleId" label="Role" required options={roleOptions} defaultValue={roleOptions[0]?.value} />
            </NewButton>
          </>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Members" />
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Added on</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {members.map((m) => {
                const isOwner = m.userId === ctx.company.ownerId;
                return (
                  <tr key={m.id}>
                    <Td className="font-medium">
                      {m.user.name} {m.userId === ctx.user.id ? <Badge>You</Badge> : null}
                    </Td>
                    <Td className="text-muted">{m.user.email}</Td>
                    <Td>{isOwner ? <Badge tone="blue">Owner</Badge> : m.role.title}</Td>
                    <Td className="text-muted">{formatDate(isoDate(m.createdAt), df)}</Td>
                    <Td>
                      {isOwner || m.userId === ctx.user.id ? null : (
                        <RowActions
                          editTitle={`Edit ${m.user.name}`}
                          editAction={updateMemberRoleAction}
                          editFields={
                            <>
                              <input type="hidden" name="userId" value={m.userId} />
                              <SelectField name="roleId" label="Role" required options={roleOptions} defaultValue={String(m.roleId)} />
                            </>
                          }
                          deleteAction={removeMemberAction.bind(null, m.userId)}
                          deleteTitle={`Remove ${m.user.name}?`}
                          deleteDescription="They lose access to this company. Documents they created remain."
                        />
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Pending invitations" />
          {invitations.length === 0 ? (
            <EmptyState title="No pending invitations" description="Invite teammates by email; they choose their own password." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Invited by</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invitations.map((i) => (
                  <tr key={i.id}>
                    <Td className="font-medium">
                      {i.email} {i.expiresAt < new Date() ? <Badge tone="amber">Expired</Badge> : null}
                    </Td>
                    <Td>{i.role.title}</Td>
                    <Td className="text-muted">{inviters.get(i.invitedById) ?? "—"}</Td>
                    <Td className="text-muted">{formatDate(isoDate(i.createdAt), df)}</Td>
                    <Td>
                      <RowActions deleteAction={cancelInvitationAction.bind(null, i.id)} deleteTitle={`Cancel invitation for ${i.email}?`} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
