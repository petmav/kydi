import type { Metadata } from "next";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { Field, SelectField } from "@/components/form";
import { SectionForm } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { transferOwnershipAction } from "./actions";

export const metadata: Metadata = { title: "Transfer ownership" };

export default async function OwnershipPage() {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can transfer ownership." />;
  const members = await db.companyUser.findMany({
    where: { companyId: ctx.companyId, userId: { not: ctx.user.id } },
    include: { user: { select: { id: true, name: true, email: true } }, role: { select: { title: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <Card>
      <CardHeader title="Transfer ownership" description="Make another member the owner of this company." />
      <CardBody className="space-y-4">
        <Alert tone="warning" title="This cannot be undone by you">
          The new owner receives the Owner role and every owner-only power (company settings, members, roles, deleting the company). You stay a
          member with the Manager role; only the new owner can give ownership back.
        </Alert>
        {members.length === 0 ? (
          <p className="text-sm text-muted">There are no other members yet. Invite someone under Members first.</p>
        ) : (
          <SectionForm action={transferOwnershipAction} submitLabel="Transfer ownership">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                name="userId"
                label="New owner"
                required
                placeholder="Choose a member"
                options={members.map((m) => ({ value: String(m.user.id), label: `${m.user.name} (${m.user.email}) · ${m.role.title}` }))}
              />
              <Field name="confirm" label={`Type "${ctx.company.name}" to confirm`} required autoComplete="off" />
            </div>
          </SectionForm>
        )}
      </CardBody>
    </Card>
  );
}
