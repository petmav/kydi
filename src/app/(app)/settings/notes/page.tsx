import type { Metadata } from "next";
import { Badge, Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { CheckboxField, Field, SelectField } from "@/components/form";
import { NewButton, RowActions, TemplateTextarea } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { COMPANY_PLACEHOLDERS, CUSTOMER_PLACEHOLDERS } from "@/lib/placeholders";
import { deleteNoteAction, saveNoteAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Notes" };

const TYPES = ["Invoice", "Estimate", "Payment"].map((t) => ({ value: t, label: t }));

function NoteFields({ note }: { note?: { id: number; name: string; type: string; notes: string; isDefault: boolean } }) {
  return (
    <>
      {note ? <input type="hidden" name="id" value={note.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Name" required defaultValue={note?.name} />
        <SelectField name="type" label="Type" required options={TYPES} defaultValue={note?.type ?? "Invoice"} />
      </div>
      <TemplateTextarea name="notes" label="Notes (HTML)" defaultValue={note?.notes ?? ""} placeholders={[...CUSTOMER_PLACEHOLDERS, ...COMPANY_PLACEHOLDERS.slice(0, 1)]} />
      <CheckboxField name="isDefault" label="Set as default" hint="Pre-fills the notes of new documents of this type." defaultChecked={note?.isDefault} />
    </>
  );
}

export default async function NotesPage() {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-all-notes")) return <Forbidden />;
  const manage = ctx.can("manage-all-notes");
  const notes = await db.note.findMany({ where: { companyId: ctx.companyId }, orderBy: [{ type: "asc" }, { name: "asc" }] });
  return (
    <Card>
      <CardHeader
        title="Notes"
        description="Reusable notes for invoices, estimates and payment receipts (terms, bank details, thank-you messages)."
        actions={
          manage ? (
            <NewButton label="Add note" title="New note" action={saveNoteAction} wide>
              <NoteFields />
            </NewButton>
          ) : null
        }
      />
      {notes.length === 0 ? (
        <EmptyState title="No notes yet" description="Save your payment terms or bank details once and insert them in any document." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {notes.map((n) => (
              <tr key={n.id}>
                <Td className="font-medium">
                  {n.name} {n.isDefault ? <Badge tone="green">Default</Badge> : null}
                </Td>
                <Td>{n.type}</Td>
                <Td>
                  {manage ? (
                    <RowActions
                      wide
                      editTitle={`Edit ${n.name}`}
                      editAction={saveNoteAction}
                      editFields={<NoteFields note={n} />}
                      deleteAction={deleteNoteAction.bind(null, n.id)}
                      deleteTitle={`Delete ${n.name}?`}
                    />
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
