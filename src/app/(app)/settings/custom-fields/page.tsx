import type { Metadata } from "next";
import { Badge, Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { CustomFieldFields, NewButton, RowActions } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { CF_MODELS, CF_TYPES } from "@/lib/custom-fields";
import { deleteCustomFieldAction, saveCustomFieldAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Custom fields" };

export default async function CustomFieldsPage() {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-custom-field")) return <Forbidden />;
  const fields = await db.customField.findMany({
    where: { companyId: ctx.companyId },
    orderBy: [{ modelType: "asc" }, { order: "asc" }],
    include: { _count: { select: { values: true } } },
  });
  const models = [...CF_MODELS];
  const types = [...CF_TYPES];
  return (
    <Card>
      <CardHeader
        title="Custom fields"
        description="Capture extra information on customers, documents, payments, expenses, items and your company."
        actions={
          ctx.can("create-custom-field") ? (
            <NewButton label="Add custom field" title="New custom field" action={saveCustomFieldAction} wide>
              <CustomFieldFields models={models} types={types} />
            </NewButton>
          ) : null
        }
      />
      {fields.length === 0 ? (
        <EmptyState title="No custom fields" description="Add fields like “PO number” on invoices or “Account manager” on customers." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Label</Th>
              <Th>Model</Th>
              <Th>Type</Th>
              <Th>Required</Th>
              <Th>Placeholder</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {fields.map((f) => (
              <tr key={f.id}>
                <Td className="font-medium">
                  {f.label} {f.placement === "document" ? <Badge tone="blue">On PDF</Badge> : null}
                </Td>
                <Td>{f.modelType}</Td>
                <Td>{f.type}</Td>
                <Td>{f.isRequired ? "Yes" : "No"}</Td>
                <Td className="font-mono text-xs text-muted">{`{${f.slug}}`}</Td>
                <Td>
                  <RowActions
                    wide
                    editTitle={ctx.can("edit-custom-field") ? `Edit ${f.label}` : undefined}
                    editAction={ctx.can("edit-custom-field") ? saveCustomFieldAction : undefined}
                    editFields={
                      <CustomFieldFields
                        models={models}
                        types={types}
                        field={{ ...f, inUse: f._count.values > 0, validation: (f.validation as Record<string, string | number | null> | null) ?? null }}
                      />
                    }
                    deleteAction={ctx.can("delete-custom-field") ? deleteCustomFieldAction.bind(null, f.id) : undefined}
                    deleteTitle={`Delete ${f.label}?`}
                    deleteDescription={f._count.values > 0 ? `This field has ${f._count.values} answer(s); they will be deleted too.` : undefined}
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
