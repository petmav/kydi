import type { Metadata } from "next";
import { Percent } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { CheckboxField } from "@/components/form";
import { NewButton, RowActions, SectionForm, TaxTypeFields } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatMoney, minorToInput, plain } from "@/lib/money";
import { saveSettingsSectionAction } from "../actions";
import { deleteTaxTypeAction, saveTaxTypeAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Tax types" };

export default async function TaxTypesPage() {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-tax-type")) return <Forbidden />;
  const s = ctx.settings;
  const taxes = plain(await db.taxType.findMany({ where: { companyId: ctx.companyId }, orderBy: [{ transactionType: "asc" }, { name: "asc" }] }));
  return (
    <>
      {ctx.isOwner ? (
        <Card>
          <CardHeader title="Tax behaviour" description="How taxes are applied on invoices, estimates and recurring invoices." />
          <CardBody>
            <SectionForm action={saveSettingsSectionAction.bind(null, "taxes")}>
              <CheckboxField name="tax_per_item" label="Tax per item" hint="Choose taxes on each line instead of once for the whole document." defaultChecked={s.tax_per_item === "YES"} />
              <CheckboxField name="tax_included" label="Enable “prices include tax”" hint="Adds a toggle on documents to treat entered prices as tax-inclusive." defaultChecked={s.tax_included === "YES"} />
              <CheckboxField name="tax_included_by_default" label="Prices include tax by default" hint="New documents start with prices-include-tax switched on." defaultChecked={s.tax_included_by_default === "YES"} />
            </SectionForm>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader
          title="Tax types"
          description="Sales taxes apply to invoices and estimates; purchase taxes to expenses."
          actions={
            ctx.can("create-tax-type") ? (
              <NewButton label="Add tax" title="New tax type" action={saveTaxTypeAction}>
                <TaxTypeFields />
              </NewButton>
            ) : null
          }
        />
        {taxes.length === 0 ? (
          <EmptyState icon={<Percent className="h-6 w-6" aria-hidden="true" />} title="No tax types yet" description="Create VAT, GST or sales tax rates to apply on documents." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Used for</Th>
                <Th>Rate</Th>
                <Th>Description</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {taxes.map((t) => (
                <tr key={t.id}>
                  <Td className="font-medium">
                    {t.name} {t.compound ? <Badge tone="violet">Compound</Badge> : null}
                  </Td>
                  <Td>
                    <Badge tone={t.transactionType === "SALES" ? "blue" : "amber"}>{t.transactionType === "SALES" ? "Sales" : "Purchases"}</Badge>
                  </Td>
                  <Td className="tabular">{t.calculationType === "PERCENTAGE" ? `${t.percent}%` : formatMoney(t.fixedAmount ?? 0, s.currency, s.locale)}</Td>
                  <Td className="max-w-xs truncate text-muted">{t.description}</Td>
                  <Td>
                    <RowActions
                      editTitle={ctx.can("edit-tax-type") ? `Edit ${t.name}` : undefined}
                      editAction={ctx.can("edit-tax-type") ? saveTaxTypeAction : undefined}
                      editFields={<TaxTypeFields tax={{ ...t, fixedAmount: minorToInput(t.fixedAmount) }} />}
                      deleteAction={ctx.can("delete-tax-type") ? deleteTaxTypeAction.bind(null, t.id) : undefined}
                      deleteTitle={`Delete ${t.name}?`}
                      deleteDescription="Documents keep their applied tax snapshot. Deletion is refused while the tax is attached anywhere."
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
