import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardBody, CardHeader, DescriptionList, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { ConfirmButton } from "@/components/confirm";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { addDaysIso, formatDate, isoDate, todayIn } from "@/lib/dates";
import { countryName } from "@/lib/intl-data";
import { formatMoney } from "@/lib/money";
import { payablesSplit } from "@/domain/purchasing";
import { BILL_STATUS_TONE } from "../../purchases/data";
import { deleteSupplierAction } from "../../purchases/actions";

export const metadata: Metadata = { title: "Supplier" };

/** Spec §5.9 supplier detail: overview (payables split), bills, payments, credits. */
export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-supplier")) return <Forbidden />;
  const id = parseId((await params).id);
  const s = await db.supplier.findFirst({ where: { id, companyId: ctx.companyId }, include: { expenseCategory: true } });
  if (!s) notFound();
  const [bills, payments] = await Promise.all([
    db.bill.findMany({ where: { supplierId: id }, orderBy: [{ documentDate: "desc" }, { id: "desc" }], take: 50 }),
    db.supplierPayment.findMany({ where: { supplierId: id }, orderBy: [{ paymentDate: "desc" }, { id: "desc" }], take: 50 }),
  ]);
  const st = ctx.settings;
  const today = todayIn(st.time_zone);
  const split = payablesSplit(
    bills.filter((b) => b.type === "BILL" && b.status === "OPEN").map((b) => ({ dueDate: b.dueDate ? isoDate(b.dueDate) : null, baseDue: Number(b.dueAmount) })),
    today,
    addDaysIso(today, 30),
  );
  const money = (v: number | bigint) => formatMoney(v, s.currency, st.locale);
  const df = (d: Date | null) => (d ? formatDate(isoDate(d), st.date_format) : "—");
  const address = [s.street1, s.street2, [s.city, s.state, s.zip].filter(Boolean).join(", "), countryName(s.country)].filter(Boolean).join("\n");
  const docTable = (rows: typeof bills, empty: string) =>
    rows.length === 0 ? (
      <CardBody className="text-sm text-muted">{empty}</CardBody>
    ) : (
      <Table>
        <thead>
          <tr>
            <Th>Number</Th>
            <Th>Date</Th>
            <Th>Status</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Due</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((b) => (
            <tr key={b.id}>
              <Td>
                <Link href={`/bills/${b.id}`} className="text-brand-700 hover:underline focus-ring rounded">
                  {b.number}
                </Link>
              </Td>
              <Td className="text-muted">{df(b.documentDate)}</Td>
              <Td>
                <Badge tone={BILL_STATUS_TONE[b.status]}>{b.status === "OPEN" ? "Open" : b.status === "DRAFT" ? "Draft" : "Void"}</Badge>
              </Td>
              <Td className="tabular text-right">{money(b.total)}</Td>
              <Td className="tabular text-right">{b.type === "BILL" ? money(b.dueAmount) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  return (
    <>
      <PageHeader
        title={s.name}
        description={[s.contactName, s.email, s.phone].filter(Boolean).join(" · ") || undefined}
        back={<Link href="/suppliers" className="text-brand-700 hover:underline focus-ring rounded">← Suppliers</Link>}
        actions={
          <>
            {ctx.can("create-bill") && s.enabled ? <ButtonLink href={`/bills/new?supplier=${s.id}`}>New bill</ButtonLink> : null}
            {ctx.can("create-supplier-payment") && s.enabled ? <ButtonLink href={`/supplier-payments/new?supplier=${s.id}`} variant="secondary">Record payment</ButtonLink> : null}
            {ctx.can("create-supplier-credit") && s.enabled ? <ButtonLink href={`/bills/new?type=credit&supplier=${s.id}`} variant="secondary">New credit</ButtonLink> : null}
            {ctx.can("edit-supplier") ? <ButtonLink href={`/suppliers/${s.id}/edit`} variant="secondary">Edit</ButtonLink> : null}
            {ctx.can("delete-supplier") ? (
              <ConfirmButton action={deleteSupplierAction.bind(null, s.id)} title={`Delete ${s.name}?`} description="Suppliers with bills, payments or recurring costs cannot be deleted; disable them instead." confirmLabel="Delete" redirectTo="/suppliers">
                Delete
              </ConfirmButton>
            ) : null}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {[
          ["Outstanding", split.total, `${split.count} open bill(s)`],
          ["Overdue", split.overdue.amount, `${split.overdue.count} bill(s)`],
          ["Due within 30 days", split.dueSoon.amount, `${split.dueSoon.count} bill(s)`],
          ["Due later", split.later.amount, `${split.later.count} bill(s)`],
        ].map(([k, v, h]) => (
          <Card key={k as string} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{k}</p>
            <p className="tabular mt-1 text-xl font-semibold">{money(v as number)}</p>
            <p className="mt-1 text-xs text-muted">{h}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DescriptionList
              items={[
                { label: "Currency", value: s.currency },
                { label: "Payment terms", value: `${s.paymentTerms} days` },
                { label: "Default category", value: s.expenseCategory?.name ?? null },
                { label: "Tax ID", value: s.taxId },
                { label: "Website", value: s.website },
                { label: "Status", value: s.enabled ? <Badge tone="green">Enabled</Badge> : <Badge>Disabled</Badge> },
                { label: "Address", value: address ? <span className="whitespace-pre-line">{address}</span> : null },
              ]}
            />
          </CardBody>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Bills" />
            {docTable(bills.filter((b) => b.type === "BILL"), "No bills yet.")}
          </Card>
          <Card>
            <CardHeader title="Supplier credits" />
            {docTable(bills.filter((b) => b.type === "SUPPLIER_CREDIT"), "No credits.")}
          </Card>
          <Card>
            <CardHeader title="Payments and refunds" />
            {payments.length === 0 ? (
              <CardBody className="text-sm text-muted">No payments yet.</CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Number</Th>
                    <Th>Type</Th>
                    <Th>Date</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <Td>
                        <Link href={`/supplier-payments/${p.id}`} className="text-brand-700 hover:underline focus-ring rounded">
                          {p.number}
                        </Link>
                      </Td>
                      <Td>{p.type === "PAYMENT" ? "Payment" : "Refund"}</Td>
                      <Td className="text-muted">{df(p.paymentDate)}</Td>
                      <Td>{p.status === "VOID" ? <Badge tone="red">Void</Badge> : <Badge tone="blue">Open</Badge>}</Td>
                      <Td className="tabular text-right">{money(p.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
