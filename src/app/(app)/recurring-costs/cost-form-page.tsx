import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { CheckboxField, Field, Form, Label, SelectField, SubmitButton } from "@/components/form";
import { inputClass } from "@/components/ui/primitives";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { isoDate, todayIn, zonedParts } from "@/lib/dates";
import { minorToInput } from "@/lib/money";
import { RECURRING_COST_PRESETS } from "@/domain/purchasing";
import { categoryOptions, purchaseTaxOptions, supplierOptions } from "../purchases/data";
import { saveRecurringCostAction } from "../purchases/actions";

/** Recurring cost form (spec §3.20 / §4.14): generates a bill or an expense on a daily-or-slower schedule. */
export async function RecurringCostFormPage({ id }: { id: number | null }) {
  const ctx = await getCompanyContext();
  if (!ctx.can(id ? "edit-recurring-cost" : "create-recurring-cost")) return <Forbidden />;
  const r = id ? await db.recurringCost.findFirst({ where: { id, companyId: ctx.companyId } }) : null;
  if (id && !r) notFound();
  const [suppliers, categories, taxes] = await Promise.all([supplierOptions(ctx.companyId), categoryOptions(ctx.companyId), purchaseTaxOptions(ctx.companyId)]);
  const t = (r?.template ?? {}) as { expenseCategoryId?: number; description?: string; amount?: number; taxTypeIds?: number[] };
  const tz = ctx.settings.time_zone;
  const start = r ? (() => { const p = zonedParts(r.startsAt, tz); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; })() : todayIn(tz);
  const back = "/bills?tab=recurring";
  return (
    <>
      <PageHeader title={r ? `Edit ${r.name}` : "New recurring cost"} back={<Link href={back} className="text-brand-700 hover:underline focus-ring rounded">← Recurring bills</Link>} />
      {suppliers.length === 0 || categories.length === 0 ? (
        <Alert tone="warning">Create a supplier and an expense category first.</Alert>
      ) : (
        <Form action={saveRecurringCostAction.bind(null, r?.id ?? null)} className="space-y-6" showErrorSummary>
          <Card>
            <CardHeader title="Schedule" />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field name="name" label="Name" required defaultValue={r?.name ?? ""} placeholder="Office rent" />
              <SelectField name="supplierId" label="Supplier" required options={suppliers.filter((x) => x.enabled || x.id === r?.supplierId).map((x) => ({ value: String(x.id), label: `${x.name} (${x.currency})` }))} placeholder="Choose a supplier" defaultValue={r ? String(r.supplierId) : ""} disabled={!!r && r.runCount > 0} hint={r && r.runCount > 0 ? "Locked after the first run." : undefined} />
              {r && r.runCount > 0 ? <input type="hidden" name="supplierId" value={r.supplierId} /> : null}
              <SelectField name="mode" label="Creates" required options={[{ value: "BILL", label: "Bill" }, { value: "EXPENSE", label: "Expense" }]} defaultValue={r?.mode ?? "BILL"} />
              <SelectField name="frequency" label="Frequency" required options={RECURRING_COST_PRESETS.map((p) => ({ value: p.value, label: p.label }))} defaultValue={r?.frequency ?? "0 0 1 * *"} />
              <Field name="startsAt" label="Starts on" type="date" required defaultValue={start} />
              <SelectField name="limitBy" label="Ends" options={[{ value: "NONE", label: "Never" }, { value: "COUNT", label: "After a number of runs" }, { value: "DATE", label: "On a date" }]} defaultValue={r?.limitBy ?? "NONE"} />
              <Field name="limitCount" label="Number of runs" type="number" min="1" defaultValue={r?.limitCount ?? ""} hint="Used when ending after a number of runs." />
              <Field name="limitDate" label="End date" type="date" defaultValue={r?.limitDate ? isoDate(r.limitDate) : ""} hint="Used when ending on a date." />
              <Field name="dueDays" label="Bill due after (days)" type="number" min="0" max="365" defaultValue={r?.dueDays ?? 30} />
              <CheckboxField name="createAsDraft" label="Create bills as drafts" defaultChecked={r?.createAsDraft ?? false} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="What to record" description="In the supplier's currency. Foreign-currency runs use the last rate logged for that currency." />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField name="expenseCategoryId" label="Category" required options={categories.map((c) => ({ value: String(c.id), label: c.name }))} placeholder="Choose a category" defaultValue={t.expenseCategoryId ? String(t.expenseCategoryId) : ""} />
              <Field name="description" label="Description" required defaultValue={t.description ?? ""} />
              <Field name="amount" label="Amount" required inputMode="decimal" defaultValue={t.amount ? minorToInput(t.amount) : ""} />
              <div>
                <Label htmlFor="rc-taxes">Purchase taxes (bills)</Label>
                <select id="rc-taxes" name="taxTypeIds" multiple size={3} defaultValue={(t.taxTypeIds ?? []).map(String)} className={inputClass} disabled={taxes.length === 0}>
                  {taxes.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.calculationType === "PERCENTAGE" ? ` ${x.percent}%` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </CardBody>
          </Card>
          <div className="flex justify-end gap-2">
            <Link href={back} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-4 text-sm text-ink-2 hover:bg-subtle focus-ring">
              Cancel
            </Link>
            <SubmitButton pendingLabel="Saving…">Save recurring cost</SubmitButton>
          </div>
        </Form>
      )}
    </>
  );
}
