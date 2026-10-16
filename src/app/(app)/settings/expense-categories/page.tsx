import type { Metadata } from "next";
import { Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { Field, TextareaField } from "@/components/form";
import { NewButton, RowActions } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { deleteExpenseCategoryAction, saveExpenseCategoryAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Expense categories" };

export default async function ExpenseCategoriesPage() {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-expense")) return <Forbidden />;
  const cats = await db.expenseCategory.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { name: "asc" },
    include: { _count: { select: { expenses: true } } },
  });
  return (
    <Card>
      <CardHeader
        title="Expense categories"
        description="Group expenses for reporting."
        actions={
          ctx.can("create-expense") ? (
            <NewButton label="Add category" title="New expense category" action={saveExpenseCategoryAction}>
              <Field name="name" label="Name" required autoFocus />
              <TextareaField name="description" label="Description" />
            </NewButton>
          ) : null
        }
      />
      {cats.length === 0 ? (
        <EmptyState title="No categories yet" description="Create categories like Travel, Software or Office supplies." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Description</Th>
              <Th>Expenses</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {cats.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium">{c.name}</Td>
                <Td className="max-w-sm truncate text-muted">{c.description}</Td>
                <Td className="text-muted">{c._count.expenses}</Td>
                <Td>
                  <RowActions
                    editTitle={ctx.can("edit-expense") ? `Edit ${c.name}` : undefined}
                    editAction={ctx.can("edit-expense") ? saveExpenseCategoryAction : undefined}
                    editFields={
                      <>
                        <input type="hidden" name="id" value={c.id} />
                        <Field name="name" label="Name" required defaultValue={c.name} />
                        <TextareaField name="description" label="Description" defaultValue={c.description ?? ""} />
                      </>
                    }
                    deleteAction={ctx.can("delete-expense") ? deleteExpenseCategoryAction.bind(null, c.id) : undefined}
                    deleteTitle={`Delete ${c.name}?`}
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
