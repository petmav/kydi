import type { Metadata } from "next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Card, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ModalForm } from "@/components/modal";
import { ConfirmButton } from "@/components/confirm";
import { Field, SelectField } from "@/components/form";
import { requireUser } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/dates";
import { adminDeleteUserAction, adminSaveUserAction } from "../actions";

export const metadata: Metadata = { title: "Users · Administration" };

type CompanyRoles = { id: number; name: string; ownerId: number; roles: { id: number; title: string; isOwner: boolean }[] }[];

function UserFields({
  user,
  companies,
}: {
  user?: { id: number; name: string; email: string; phone: string | null; role: string; memberships: { companyId: number; roleId: number }[] };
  companies: CompanyRoles;
}) {
  const roleIn = (companyId: number) => user?.memberships.find((m) => m.companyId === companyId)?.roleId;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Name" required defaultValue={user?.name} />
        <Field name="email" label="Email" type="email" required defaultValue={user?.email} />
        <Field name="phone" label="Phone" defaultValue={user?.phone ?? ""} />
        <SelectField
          name="role"
          label="Platform role"
          defaultValue={user?.role ?? "USER"}
          options={[
            { value: "USER", label: "User" },
            { value: "SUPER_ADMIN", label: "Platform administrator" },
          ]}
        />
        <Field name="password" label="Password" type="password" autoComplete="new-password" required={!user} hint={user ? "Leave blank to keep the current password." : "At least 10 characters."} className="sm:col-span-2" />
      </div>
      <fieldset className="rounded-md border border-line p-3">
        <legend className="px-1 text-sm font-medium">Company memberships</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {companies.map((c) => {
            const owns = user ? c.ownerId === user.id : false;
            return (
              <SelectField
                key={c.id}
                name={`membership_${c.id}`}
                label={c.name}
                defaultValue={String(roleIn(c.id) ?? "")}
                disabled={owns}
                hint={owns ? "Owner. Change the owner on the company first." : undefined}
                options={[{ value: "", label: "Not a member" }, ...c.roles.filter((r) => !r.isOwner || owns).map((r) => ({ value: String(r.id), label: r.title }))]}
              />
            );
          })}
        </div>
      </fieldset>
    </>
  );
}

/** Spec §5.13 All users: list, create/edit (platform role and memberships with role per company), delete. */
export default async function AdminUsersPage() {
  const actor = await requireUser();
  if (actor.role !== "SUPER_ADMIN") return null;
  const [users, companiesRaw] = await Promise.all([
    db.user.findMany({ include: { memberships: { include: { company: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } }),
    db.company.findMany({ include: { roles: { select: { id: true, title: true, isOwner: true }, orderBy: { id: "asc" } } }, orderBy: { name: "asc" } }),
  ]);
  const companies: CompanyRoles = companiesRaw.map((c) => ({ id: c.id, name: c.name, ownerId: c.ownerId, roles: c.roles }));
  return (
    <Card>
      <CardHeader
        title="Users"
        description="Every account on this installation."
        actions={
          <ModalForm
            trigger={
              <>
                <Plus className="h-4 w-4" aria-hidden="true" /> New user
              </>
            }
            title="New user"
            action={adminSaveUserAction.bind(null, null)}
            size="sm"
            wide
          >
            <UserFields companies={companies} />
          </ModalForm>
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Companies</Th>
            <Th>Created</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {users.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">{u.name}</Td>
              <Td className="text-muted">{u.email}</Td>
              <Td>{u.role === "SUPER_ADMIN" ? <Badge tone="blue">Administrator</Badge> : "User"}</Td>
              <Td className="max-w-xs truncate text-muted">{u.memberships.map((m) => m.company.name).join(", ") || "None"}</Td>
              <Td className="text-muted">{formatDate(isoDate(u.createdAt), "yyyy-MM-dd")}</Td>
              <Td>
                <div className="flex justify-end gap-1">
                  <ModalForm trigger={<Pencil className="h-4 w-4" aria-label={`Edit ${u.name}`} />} title={`Edit ${u.name}`} action={adminSaveUserAction.bind(null, u.id)} variant="ghost" size="sm" wide>
                    <UserFields
                      user={{ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, memberships: u.memberships.map((m) => ({ companyId: m.companyId, roleId: m.roleId })) }}
                      companies={companies}
                    />
                  </ModalForm>
                  {u.id !== actor.id ? (
                    <ConfirmButton
                      action={adminDeleteUserAction.bind(null, u.id)}
                      title={`Delete ${u.name}?`}
                      description="The account and its memberships are deleted. Documents they created stay, without an author."
                      confirmLabel="Delete user"
                      variant="ghost"
                      size="sm"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" aria-label={`Delete ${u.name}`} />
                    </ConfirmButton>
                  ) : null}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
