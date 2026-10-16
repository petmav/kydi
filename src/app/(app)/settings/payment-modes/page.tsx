import type { Metadata } from "next";
import { Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { Field } from "@/components/form";
import { NewButton, RowActions } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { deletePaymentMethodAction, savePaymentMethodAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Payment modes" };

export default async function PaymentModesPage() {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-payment")) return <Forbidden />;
  const modes = await db.paymentMethod.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { name: "asc" },
    include: { _count: { select: { payments: true, expenses: true } } },
  });
  return (
    <Card>
      <CardHeader
        title="Payment modes"
        description="How customers pay you and how you pay expenses."
        actions={
          ctx.can("create-payment") ? (
            <NewButton label="Add payment mode" title="New payment mode" action={savePaymentMethodAction}>
              <Field name="name" label="Name" required autoFocus />
            </NewButton>
          ) : null
        }
      />
      {modes.length === 0 ? (
        <EmptyState title="No payment modes" description="Add modes such as Cash or Bank Transfer." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Used by</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {modes.map((m) => (
              <tr key={m.id}>
                <Td className="font-medium">{m.name}</Td>
                <Td className="text-muted">
                  {m._count.payments} payments · {m._count.expenses} expenses
                </Td>
                <Td>
                  <RowActions
                    editTitle={ctx.can("edit-payment") ? `Edit ${m.name}` : undefined}
                    editAction={ctx.can("edit-payment") ? savePaymentMethodAction : undefined}
                    editFields={
                      <>
                        <input type="hidden" name="id" value={m.id} />
                        <Field name="name" label="Name" required defaultValue={m.name} />
                      </>
                    }
                    deleteAction={ctx.can("delete-payment") ? deletePaymentMethodAction.bind(null, m.id) : undefined}
                    deleteTitle={`Delete ${m.name}?`}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
