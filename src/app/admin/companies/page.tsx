import type { Metadata } from "next";
import { Pencil, Trash2 } from "lucide-react";
import { Card, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ModalForm } from "@/components/modal";
import { Field, SelectField } from "@/components/form";
import { requireUser } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/dates";
import { countryOptions } from "@/lib/intl-data";
import { adminDeleteCompanyAction, adminUpdateCompanyAction } from "../actions";

export const metadata: Metadata = { title: "Companies · Administration" };

/** Spec §5.13 Companies: list (name, owner, members, created); edit (name, owner transfer, address); delete. */
export default async function AdminCompaniesPage() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") return null;
  const companies = await db.company.findMany({
    include: { owner: { select: { name: true } }, members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const countries = countryOptions();
  return (
    <Card>
      <CardHeader title="Companies" description="Every company on this installation." />
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Owner</Th>
            <Th className="text-right">Members</Th>
            <Th>Created</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {companies.map((c) => (
            <tr key={c.id}>
              <Td className="font-medium">{c.name}</Td>
              <Td>{c.owner.name}</Td>
              <Td className="tabular text-right">{c.members.length}</Td>
              <Td className="text-muted">{formatDate(isoDate(c.createdAt), "yyyy-MM-dd")}</Td>
              <Td>
                <div className="flex justify-end gap-1">
                  <ModalForm
                    trigger={<Pencil className="h-4 w-4" aria-label={`Edit ${c.name}`} />}
                    title={`Edit ${c.name}`}
                    action={adminUpdateCompanyAction.bind(null, c.id)}
                    variant="ghost"
                    size="sm"
                    wide
                  >
                    <Field name="name" label="Company name" required defaultValue={c.name} />
                    <SelectField
                      name="ownerId"
                      label="Owner"
                      required
                      defaultValue={String(c.ownerId)}
                      options={c.members.map((m) => ({ value: String(m.user.id), label: `${m.user.name} (${m.user.email})` }))}
                      hint="Changing the owner gives them the Owner role; the previous owner becomes a Manager."
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field name="street1" label="Address line 1" defaultValue={c.street1 ?? ""} />
                      <Field name="street2" label="Address line 2" defaultValue={c.street2 ?? ""} />
                      <Field name="city" label="City" defaultValue={c.city ?? ""} />
                      <Field name="state" label="State / region" defaultValue={c.state ?? ""} />
                      <Field name="zip" label="ZIP / postal code" defaultValue={c.zip ?? ""} />
                      <SelectField name="country" label="Country" options={countries} placeholder="Select a country" defaultValue={c.country ?? ""} />
                      <Field name="phone" label="Phone" defaultValue={c.phone ?? ""} />
                    </div>
                  </ModalForm>
                  <ModalForm
                    trigger={<Trash2 className="h-4 w-4 text-red-600" aria-label={`Delete ${c.name}`} />}
                    title={`Delete ${c.name}?`}
                    description="Every record of this company is purged. Member accounts survive. This cannot be undone."
                    action={adminDeleteCompanyAction.bind(null, c.id)}
                    variant="ghost"
                    size="sm"
                    submitLabel="Delete company"
                  >
                    <Field name="confirm" label={`Type "${c.name}" to confirm`} required autoComplete="off" />
                  </ModalForm>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
