import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { CheckboxField, Field, SelectField } from "@/components/form";
import { NewButton, NumberFormatField, RowActions, SectionForm, TemplateTextarea } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { CONVERT_ACTIONS, RETROSPECTIVE_EDITS } from "@/lib/settings";
import { BILLING_PLACEHOLDERS, COMPANY_PLACEHOLDERS, SHIPPING_PLACEHOLDERS } from "@/lib/placeholders";
import { cn } from "@/lib/utils";
import { saveSettingsSectionAction } from "../actions";
import { deleteUnitAction, saveUnitAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Customization" };

const TABS = [
  { key: "invoices", label: "Invoices" },
  { key: "estimates", label: "Estimates" },
  { key: "payments", label: "Payments" },
  { key: "items", label: "Items" },
] as const;

async function nextSeq(companyId: number, kind: "invoice" | "credit" | "estimate" | "payment") {
  const agg =
    kind === "estimate"
      ? await db.estimate.aggregate({ where: { companyId }, _max: { sequenceNumber: true } })
      : kind === "payment"
        ? await db.payment.aggregate({ where: { companyId }, _max: { sequenceNumber: true } })
        : await db.invoice.aggregate({ where: { companyId, type: kind === "credit" ? "CREDIT_NOTE" : "INVOICE" }, _max: { sequenceNumber: true } });
  return (agg._max.sequenceNumber ?? 0) + 1;
}

export default async function CustomizationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.isOwner) return <Forbidden message="Only the company owner can change customization." />;
  const { tab: rawTab } = await searchParams;
  const tab = TABS.find((t) => t.key === rawTab)?.key ?? "invoices";
  const s = ctx.settings;
  const addressPh = [...COMPANY_PLACEHOLDERS];
  const billPh = [...BILLING_PLACEHOLDERS, "CONTACT_DISPLAY_NAME", "CONTACT_EMAIL"];

  return (
    <Card>
      <CardHeader title="Customization" description="Numbering, defaults and printed address formats." />
      <div className="border-b border-line px-5">
        <nav className="-mb-px flex gap-4" aria-label="Customization sections">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/settings/customization?tab=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "border-b-2 px-1 py-3 text-sm font-medium focus-ring",
                tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <CardBody>
        {tab === "invoices" ? (
          <SectionForm action={saveSettingsSectionAction.bind(null, "invoices")}>
            <div className="grid gap-6 lg:grid-cols-2">
              <NumberFormatField name="invoice_number_format" label="Invoice number format" defaultValue={s.invoice_number_format} nextSequence={await nextSeq(ctx.companyId, "invoice")} />
              <NumberFormatField name="credit_note_number_format" label="Credit note number format" defaultValue={s.credit_note_number_format} nextSequence={await nextSeq(ctx.companyId, "credit")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxField name="invoice_set_due_date_automatically" label="Set due date automatically" defaultChecked={s.invoice_set_due_date_automatically === "YES"} />
              <Field name="invoice_due_date_days" label="Due after (days)" type="number" min="0" defaultValue={s.invoice_due_date_days} />
              <SelectField name="retrospective_edits" label="Retrospective edits" options={RETROSPECTIVE_EDITS} defaultValue={s.retrospective_edits} className="sm:col-span-2" />
              <CheckboxField name="invoice_email_attachment" label="Attach PDF to invoice emails" defaultChecked={s.invoice_email_attachment === "YES"} />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <TemplateTextarea name="invoice_company_address_format" label="Company address format" defaultValue={s.invoice_company_address_format} placeholders={addressPh} />
              <TemplateTextarea name="invoice_billing_address_format" label="Billing address format" defaultValue={s.invoice_billing_address_format} placeholders={billPh} />
              <TemplateTextarea name="invoice_shipping_address_format" label="Shipping address format" defaultValue={s.invoice_shipping_address_format} placeholders={SHIPPING_PLACEHOLDERS} />
            </div>
          </SectionForm>
        ) : null}
        {tab === "estimates" ? (
          <SectionForm action={saveSettingsSectionAction.bind(null, "estimates")}>
            <NumberFormatField name="estimate_number_format" label="Estimate number format" defaultValue={s.estimate_number_format} nextSequence={await nextSeq(ctx.companyId, "estimate")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxField name="estimate_set_expiry_date_automatically" label="Set expiry date automatically" defaultChecked={s.estimate_set_expiry_date_automatically === "YES"} />
              <Field name="estimate_expiry_date_days" label="Expires after (days)" type="number" min="0" defaultValue={s.estimate_expiry_date_days} />
              <SelectField name="estimate_convert_action" label="After converting to an invoice" options={CONVERT_ACTIONS} defaultValue={s.estimate_convert_action} />
              <CheckboxField name="estimate_email_attachment" label="Attach PDF to estimate emails" defaultChecked={s.estimate_email_attachment === "YES"} className="self-end" />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <TemplateTextarea name="estimate_company_address_format" label="Company address format" defaultValue={s.estimate_company_address_format} placeholders={addressPh} />
              <TemplateTextarea name="estimate_billing_address_format" label="Billing address format" defaultValue={s.estimate_billing_address_format} placeholders={billPh} />
              <TemplateTextarea name="estimate_shipping_address_format" label="Shipping address format" defaultValue={s.estimate_shipping_address_format} placeholders={SHIPPING_PLACEHOLDERS} />
            </div>
          </SectionForm>
        ) : null}
        {tab === "payments" ? (
          <SectionForm action={saveSettingsSectionAction.bind(null, "payments")}>
            <NumberFormatField name="payment_number_format" label="Payment number format" defaultValue={s.payment_number_format} nextSequence={await nextSeq(ctx.companyId, "payment")} />
            <CheckboxField name="payment_email_attachment" label="Attach PDF to payment receipt emails" defaultChecked={s.payment_email_attachment === "YES"} />
            <div className="grid gap-4 lg:grid-cols-2">
              <TemplateTextarea name="payment_company_address_format" label="Company address format" defaultValue={s.payment_company_address_format} placeholders={addressPh} />
              <TemplateTextarea name="payment_from_customer_address_format" label="Received-from address format" defaultValue={s.payment_from_customer_address_format} placeholders={billPh} />
            </div>
          </SectionForm>
        ) : null}
        {tab === "items" ? <UnitsTab companyId={ctx.companyId} /> : null}
      </CardBody>
    </Card>
  );
}

async function UnitsTab({ companyId }: { companyId: number }) {
  const units = await db.unit.findMany({ where: { companyId }, orderBy: { name: "asc" }, include: { _count: { select: { items: true } } } });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">Units appear on item lines (e.g. pc, hour, kg).</p>
        <NewButton label="Add unit" title="Add unit" action={saveUnitAction}>
          <Field name="name" label="Name" required autoFocus />
        </NewButton>
      </div>
      {units.length === 0 ? (
        <EmptyState title="No units yet" description="Add units such as pc, hour or kg." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Items</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {units.map((u) => (
              <tr key={u.id}>
                <Td className="font-medium">{u.name}</Td>
                <Td className="text-muted">{u._count.items}</Td>
                <Td>
                  <RowActions
                    editTitle={`Edit unit ${u.name}`}
                    editAction={saveUnitAction}
                    editFields={
                      <>
                        <input type="hidden" name="id" value={u.id} />
                        <Field name="name" label="Name" required defaultValue={u.name} />
                      </>
                    }
                    deleteAction={deleteUnitAction.bind(null, u.id)}
                    deleteTitle={`Delete unit ${u.name}?`}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
