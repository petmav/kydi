import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, CardBody, CardHeader, DescriptionList, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { ActionButton, ConfirmButton } from "@/components/confirm";
import { StatusBadge } from "@/components/status-badges";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, isoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { frequencyLabel } from "@/domain/cron";
import { LAST_ERROR_TEXT } from "@/server/recurring";
import { deleteOneRecurringAction, pauseResumeAction } from "../actions";

export const metadata: Metadata = { title: "Recurring invoice" };

export default async function RecurringDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-recurring-invoice")) return <Forbidden />;
  const id = parseId((await params).id);
  const r = await db.recurringInvoice.findFirst({ where: { id, companyId: ctx.companyId }, include: { customer: true, invoices: { orderBy: { invoiceDate: "desc" } }, _count: { select: { runs: true } } } });
  if (!r) notFound();
  const s = ctx.settings;
  const money = (v: number | bigint) => formatMoney(v, r.currency, s.locale);
  const canEdit = ctx.can("edit-recurring-invoice");
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{r.customer.name} <StatusBadge kind="rec" value={r.status} /></span>}
        description={`${frequencyLabel(r.frequency)} · ${money(r.total)}`}
        back={<Link href="/recurring-invoices" className="text-brand-700 hover:underline focus-ring rounded">← Recurring invoices</Link>}
        actions={
          <>
            {canEdit ? <ButtonLink href={`/recurring-invoices/${r.id}/edit`} variant="secondary">Edit</ButtonLink> : null}
            {canEdit && r.status === "ACTIVE" ? <ActionButton action={pauseResumeAction.bind(null, r.id, "pause")}>Pause</ActionButton> : null}
            {canEdit && r.status === "ON_HOLD" ? <ActionButton action={pauseResumeAction.bind(null, r.id, "resume")}>Resume</ActionButton> : null}
            {ctx.can("delete-recurring-invoice") ? (
              <ConfirmButton action={deleteOneRecurringAction.bind(null, r.id)} title="Delete this recurring invoice?" description="The schedule and its run log are deleted. Invoices it generated are kept." confirmLabel="Delete">Delete</ConfirmButton>
            ) : null}
          </>
        }
      />
      {r.lastError ? (
        <div className="mb-4">
          <Alert tone="error" title="Last run failed">
            {LAST_ERROR_TEXT[r.lastError] ?? r.lastError} Edit and save the schedule to retry immediately; otherwise it is retried hourly.
          </Alert>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Schedule" />
          <CardBody>
            <DescriptionList
              items={[
                { label: "Starts at", value: formatDateTime(r.startsAt, s.time_zone) },
                { label: "Next invoice", value: r.status === "ACTIVE" && r.nextInvoiceAt ? formatDateTime(r.nextInvoiceAt, s.time_zone) : "—" },
                { label: "Frequency", value: frequencyLabel(r.frequency) },
                { label: "Limit", value: r.limitBy === "COUNT" ? `${r._count.runs} of ${r.limitCount} invoices` : r.limitBy === "DATE" && r.limitDate ? `Until ${formatDate(isoDate(r.limitDate), s.date_format)}` : "No limit" },
                { label: "Send automatically", value: r.sendAutomatically ? "Yes" : "No" },
                { label: "Notify creator", value: r.notifyCreator ? "Yes" : "No" },
                { label: "Amount", value: <span className="tabular">{money(r.total)}</span> },
                { label: "Time zone", value: s.time_zone },
              ]}
            />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Generated invoices" />
          {r.invoices.length === 0 ? (
            <CardBody className="text-sm text-muted">No generated invoices yet.</CardBody>
          ) : (
            <Table>
              <thead><tr><Th>Date</Th><Th>Number</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></thead>
              <tbody className="divide-y divide-line">
                {r.invoices.map((i) => (
                  <tr key={i.id}>
                    <Td>{formatDate(isoDate(i.invoiceDate), s.date_format)}</Td>
                    <Td><Link href={`/invoices/${i.id}`} className="text-brand-700 hover:underline">{i.invoiceNumber}</Link></Td>
                    <Td><StatusBadge kind="inv" value={i.status} /></Td>
                    <Td className="tabular text-right">{money(i.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
