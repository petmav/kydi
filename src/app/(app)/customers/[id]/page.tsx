import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, DescriptionList, PageHeader, Td, Th, Table, Badge } from "@/components/ui/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { ConfirmButton } from "@/components/confirm";
import { Tabs } from "@/components/list";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { countryName } from "@/lib/intl-data";
import { formatDate, todayIn, addDaysIso, isoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getCustomFields, loadCustomFieldAnswers, displayAnswer } from "@/lib/custom-fields";
import { getBaseUrl } from "@/lib/url";
import type { SearchParams } from "@/lib/list";
import { customerBalances } from "@/server/customers";
import { activityStatement, outstandingStatement } from "@/server/statement";
import { deleteCustomerAction } from "../actions";

export const metadata: Metadata = { title: "Customer" };

function address(c: Record<string, unknown>, p: "billing" | "shipping") {
  const g = (k: string) => (c[`${p}${k}`] as string | null) ?? "";
  const lines = [g("Name"), g("Street1"), g("Street2"), [g("City"), g("State"), g("Zip")].filter(Boolean).join(", "), countryName(g("Country") || null) ?? "", g("Phone")].filter(Boolean);
  return lines.length ? lines : null;
}

export default async function CustomerDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-customer")) return <Forbidden />;
  const id = parseId((await params).id);
  const sp = await searchParams;
  const c = await db.customer.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!c) notFound();
  const s = ctx.settings;
  const money = (v: number) => formatMoney(v, c.currency, s.locale);
  const df = (v: string | null) => (v ? formatDate(v, s.date_format) : "—");
  const bal = (await customerBalances(ctx.companyId, [c.id])).get(c.id)!;
  const [fields, answers] = await Promise.all([getCustomFields(ctx.companyId, "Customer"), loadCustomFieldAnswers("Customer", c.id)]);
  const today = todayIn(s.time_zone);
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) ?? "";
  const tab = one("tab") === "outstanding" ? "outstanding" : "activity";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(one("from")) ? one("from") : addDaysIso(today, -90);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(one("to")) ? one("to") : today;
  const billing = address(c, "billing");
  const shipping = address(c, "shipping");
  const portalUrl = `${await getBaseUrl()}/portal/${ctx.company.slug}/login`;

  return (
    <>
      <PageHeader
        title={c.name}
        description={[c.companyName, c.email].filter(Boolean).join(" · ") || undefined}
        back={
          <Link href="/customers" className="text-brand-700 hover:underline focus-ring rounded">
            ← Customers
          </Link>
        }
        actions={
          <>
            {ctx.can("create-invoice") ? <ButtonLink href={`/invoices/new?customer=${c.id}`}>New invoice</ButtonLink> : null}
            {ctx.can("create-estimate") ? (
              <ButtonLink href={`/estimates/new?customer=${c.id}`} variant="secondary">
                New estimate
              </ButtonLink>
            ) : null}
            {ctx.can("create-payment") ? (
              <ButtonLink href={`/payments/new?customer=${c.id}`} variant="secondary">
                New payment
              </ButtonLink>
            ) : null}
            {ctx.can("create-expense") ? (
              <ButtonLink href={`/expenses/new?customer=${c.id}`} variant="secondary">
                New expense
              </ButtonLink>
            ) : null}
            {ctx.can("edit-customer") ? (
              <ButtonLink href={`/customers/${c.id}/edit`} variant="secondary">
                Edit
              </ButtonLink>
            ) : null}
            {ctx.can("delete-customer") ? (
              <ConfirmButton
                action={deleteCustomerAction.bind(null, c.id)}
                title={`Delete ${c.name}?`}
                description="This also deletes all of their estimates, invoices, payments, expenses and recurring invoices. This cannot be undone."
                confirmLabel="Delete customer"
              >
                Delete
              </ConfirmButton>
            ) : null}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Account balance", value: money(bal.due - bal.credit), hint: "Invoice due minus available credit" },
          { label: "Invoice due", value: money(bal.due), hint: "Open, non-draft invoices" },
          { label: "Available credit", value: money(bal.credit), hint: "Unapplied payments" },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{k.label}</p>
            <p className="tabular mt-1 text-xl font-semibold">{k.value}</p>
            <p className="mt-1 text-xs text-muted">{k.hint}</p>
            {k.label === "Available credit" && bal.credit > 0 && bal.due > 0 && ctx.can("edit-payment") ? (
              <Link href={`/customers/${c.id}/apply-credit`} className={`${buttonClass("secondary", "sm")} mt-2`}>
                Apply credit
              </Link>
            ) : null}
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Basic information" />
          <CardBody className="space-y-5">
            <DescriptionList
              items={[
                { label: "Display name", value: c.name },
                { label: "Primary contact", value: c.contactName },
                { label: "Email", value: c.email },
                { label: "Phone", value: c.phone },
                { label: "Currency", value: c.currency },
                { label: "Website", value: c.website },
                { label: "Tax ID", value: c.taxId },
                { label: "Prefix", value: c.prefix },
                { label: "Portal access", value: c.enablePortal ? <Badge tone="green">Enabled</Badge> : <Badge>Disabled</Badge> },
                ...fields.map((f) => ({ label: f.label, value: displayAnswer(f, answers[f.id]) || null })),
              ]}
            />
            {c.enablePortal ? <p className="break-all text-xs text-muted">Portal: {portalUrl}</p> : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Billing address</p>
                <p className="mt-1 whitespace-pre-line text-sm">{billing ? billing.join("\n") : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Shipping address</p>
                <p className="mt-1 whitespace-pre-line text-sm">{shipping ? shipping.join("\n") : "—"}</p>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader
            title="Account statement"
            actions={
              <a
                href={`/api/reports/statement/${c.id}?type=${tab}&from=${from}&to=${to}&as_of=${to}`}
                className={buttonClass("secondary", "sm")}
                target="_blank"
                rel="noopener"
              >
                Download PDF
              </a>
            }
          />
          <Tabs
            basePath={`/customers/${c.id}`}
            sp={sp}
            current={tab}
            tabs={[
              { key: "activity", label: "Activity" },
              { key: "outstanding", label: "Outstanding" },
            ]}
          />
          <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
            <input type="hidden" name="tab" value={tab} />
            {tab === "activity" ? (
              <label className="text-xs font-medium text-muted">
                From
                <input type="date" name="from" defaultValue={from} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm text-ink" />
              </label>
            ) : null}
            <label className="text-xs font-medium text-muted">
              {tab === "activity" ? "To" : "As of"}
              <input type="date" name="to" defaultValue={to} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm text-ink" />
            </label>
            <button type="submit" className={buttonClass("secondary", "sm")}>
              Update
            </button>
          </form>
          {tab === "activity" ? <Activity companyId={ctx.companyId} customerId={c.id} from={from} to={to} money={money} df={df} /> : <Outstanding companyId={ctx.companyId} customerId={c.id} asOf={to} money={money} df={df} />}
        </Card>
      </div>
    </>
  );
}

async function Activity({ companyId, customerId, from, to, money, df }: { companyId: number; customerId: number; from: string; to: string; money: (v: number) => string; df: (v: string | null) => string }) {
  const st = await activityStatement(companyId, customerId, from, to);
  return (
    <Table>
      <thead>
        <tr>
          <Th>Date</Th>
          <Th>Type</Th>
          <Th>Reference</Th>
          <Th className="text-right">Debit</Th>
          <Th className="text-right">Credit</Th>
          <Th className="text-right">Balance</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        <tr className="bg-canvas">
          <Td colSpan={5} className="font-medium">
            Opening balance ({df(from)})
          </Td>
          <Td className="tabular text-right font-medium">{money(st.opening)}</Td>
        </tr>
        {st.entries.length === 0 ? (
          <tr>
            <Td colSpan={6} className="py-8 text-center text-muted">
              No activity in this period.
            </Td>
          </tr>
        ) : (
          st.entries.map((e, i) => (
            <tr key={i}>
              <Td>{df(e.date)}</Td>
              <Td>{e.type}</Td>
              <Td>
                <Link href={e.href} className="text-brand-700 hover:underline focus-ring rounded">
                  {e.number}
                </Link>
              </Td>
              <Td className="tabular text-right">{e.debit ? money(e.debit) : ""}</Td>
              <Td className="tabular text-right">{e.credit ? money(e.credit) : ""}</Td>
              <Td className="tabular text-right">{money(e.balance)}</Td>
            </tr>
          ))
        )}
        <tr className="bg-canvas">
          <Td colSpan={5} className="font-semibold">
            Closing balance ({df(to)})
          </Td>
          <Td className="tabular text-right font-semibold">{money(st.closing)}</Td>
        </tr>
      </tbody>
    </Table>
  );
}

async function Outstanding({ companyId, customerId, asOf, money, df }: { companyId: number; customerId: number; asOf: string; money: (v: number) => string; df: (v: string | null) => string }) {
  const st = await outstandingStatement(companyId, customerId, asOf);
  return (
    <div className="space-y-4 pb-4">
      <Table>
        <thead>
          <tr>
            <Th>Invoice</Th>
            <Th>Date</Th>
            <Th>Due date</Th>
            <Th className="text-right">Original</Th>
            <Th className="text-right">Applied</Th>
            <Th className="text-right">Remaining</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {st.open.length === 0 ? (
            <tr>
              <Td colSpan={6} className="py-6 text-center text-muted">
                No open invoices.
              </Td>
            </tr>
          ) : (
            st.open.map((i) => (
              <tr key={i.id}>
                <Td>
                  <Link href={`/invoices/${i.id}`} className="text-brand-700 hover:underline focus-ring rounded">
                    {i.number}
                  </Link>
                </Td>
                <Td>{df(i.date)}</Td>
                <Td>{df(i.dueDate)}</Td>
                <Td className="tabular text-right">{money(i.original)}</Td>
                <Td className="tabular text-right">{money(i.applied)}</Td>
                <Td className="tabular text-right">{money(i.remaining)}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      {st.credits.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Unapplied payment</Th>
              <Th>Date</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Allocated</Th>
              <Th className="text-right">Available</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {st.credits.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/payments/${p.id}`} className="text-brand-700 hover:underline focus-ring rounded">
                    {p.number}
                  </Link>
                </Td>
                <Td>{df(p.date)}</Td>
                <Td className="tabular text-right">{money(p.amount)}</Td>
                <Td className="tabular text-right">{money(p.allocated)}</Td>
                <Td className="tabular text-right">{money(p.available)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
      <dl className="ml-auto grid max-w-xs grid-cols-2 gap-1 px-4 text-sm">
        <dt className="text-muted">Total due</dt>
        <dd className="tabular text-right">{money(st.totalDue)}</dd>
        <dt className="text-muted">Unapplied credit</dt>
        <dd className="tabular text-right">−{money(st.totalCredit)}</dd>
        <dt className="font-semibold">Balance</dt>
        <dd className="tabular text-right font-semibold">{money(st.balance)}</dd>
      </dl>
      <p className="px-4 text-xs text-muted">As of {df(asOf)}. Generated {df(isoDate(new Date()))}.</p>
    </div>
  );
}
