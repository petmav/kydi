import Link from "next/link";
import { AlertTriangle, Wallet } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { getCompanyContext } from "@/lib/auth/context";
import { formatMoney } from "@/lib/money";
import { buildCashFlowForecast } from "@/server/cash-flow_forecast";

export const metadata = {
  title: "Cash-flow forecast",
};

type SearchParams = {
  cash?: string;
  expenses?: string;
  days?: string;
};

function amount(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return value && Number.isFinite(parsed) && parsed >= 0
    ? Math.min(parsed, 100_000_000)
    : fallback;
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getCompanyContext();

  if (
    !ctx.can("dashboard") &&
    !ctx.can("view-financial-reports")
  ) {
    return <Forbidden />;
  }

  const params = await searchParams;

  const cash = amount(params.cash, 5000);
  const expenses = amount(params.expenses, 3500);

  const requestedDays = Number(params.days ?? 90);
  const days = [30, 60, 90].includes(requestedDays)
    ? requestedDays
    : 90;

  const forecast = await buildCashFlowForecast(
    ctx.companyId,
    ctx.settings.time_zone,
    Math.round(cash * 100),
    Math.round(expenses * 100),
    days,
  );

  const money = (cents: number) =>
    formatMoney(
      cents,
      ctx.settings.currency,
      ctx.settings.locale,
    );

  const isAtRisk =
    forecast.lowestBalance.closingBalance < 0;

  const metrics = [
    {
      label: "Starting cash",
      value: forecast.startingCash,
    },
    {
      label: "Expected receipts",
      value: forecast.incomingTotal,
    },
    {
      label: "Planned expenses",
      value: forecast.expenseTotal,
    },
    {
      label: `Balance in ${days} days`,
      value: forecast.projectedEndBalance,
    },
  ];

  const maxBalance = Math.max(
    1,
    ...forecast.points.map((p) =>
      Math.abs(p.closingBalance),
    ),
  );

  return (
    <>
      <PageHeader
        title="Cash-flow early warning"
        description="See whether your business could run short of cash."
        actions={
          <Link
            href="/dashboard"
            className={buttonClass("secondary", "sm")}
          >
            Dashboard
          </Link>
        }
      />

      <Card data-tour="cash-flow-assumptions">
        <CardHeader
          title="Forecast assumptions"
          description="Enter your current cash and estimated monthly expenses."
        />

        <CardBody>
          <form
            method="get"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <label className="text-sm">
              Current cash ({ctx.settings.currency})
              <input
                name="cash"
                type="number"
                min="0"
                step="0.01"
                defaultValue={cash}
                className="mt-1 block w-full rounded-md border p-2"
              />
            </label>

            <label className="text-sm">
              Monthly expenses ({ctx.settings.currency})
              <input
                name="expenses"
                type="number"
                min="0"
                step="0.01"
                defaultValue={expenses}
                className="mt-1 block w-full rounded-md border p-2"
              />
            </label>

            <label className="text-sm">
              Forecast period
              <select
                name="days"
                defaultValue={days}
                className="mt-1 block w-full rounded-md border p-2"
              >
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                className={buttonClass("primary", "md")}
              >
                Update forecast
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="cash-flow-results">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardBody>
              <p className="text-sm text-muted">
                {metric.label}
              </p>

              <p className={`mt-2 text-xl font-semibold ${
                metric.value < 0 ? "text-red-600" : ""
              }`}>
                {money(metric.value)}
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" data-tour="cash-flow-results">
          <CardHeader
            title="Projected balance"
            description="Estimated balance at weekly checkpoints."
          />

          <CardBody>
            <div className="space-y-5">
              {forecast.points.map((point) => {
                const negative = point.closingBalance < 0;

                const width = Math.max(
                  2,
                  Math.round(
                    (Math.abs(point.closingBalance) /
                      maxBalance) *
                      100,
                  ),
                );

                return (
                  <div key={point.date}>
                    <div className="mb-1 flex justify-between gap-3 text-sm">
                      <span>{point.date}</span>

                      <span className={
                        negative
                          ? "font-semibold text-red-600"
                          : "font-semibold"
                      }>
                        {money(point.closingBalance)}
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded bg-slate-100">
                      <div
                        className={`h-full rounded ${
                          negative
                            ? "bg-red-600"
                            : "bg-emerald-600"
                        }`}
                        style={{ width: `${width}%` }}
                      />
                    </div>

                    <p className="mt-1 text-xs text-muted">
                      + {money(point.expectedReceipts)} receipts
                      {" · "}
                      − {money(point.plannedExpenses)} expenses
                    </p>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Early warning" />

          <CardBody>
            <div className="flex gap-3">
              {isAtRisk ? (
                <AlertTriangle
                  className="h-5 w-5 shrink-0 text-red-600"
                  aria-hidden="true"
                />
              ) : (
                <Wallet
                  className="h-5 w-5 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
              )}

              <div>
                <p className="font-semibold">
                  {isAtRisk
                    ? "Potential cash shortfall"
                    : "No projected shortfall"}
                </p>

                <p className="mt-2 text-sm text-muted">
                  {isAtRisk
                    ? `Your lowest projected balance is ${money(
                        forecast.lowestBalance.closingBalance,
                      )} on ${forecast.lowestBalance.date}. Review upcoming spending and follow up on outstanding invoices.`
                    : "Your projected balance stays above zero under these assumptions. Actual receipts and expenses may differ."}
                </p>
              </div>
            </div>

            <div className="mt-5 border-t pt-4 text-sm">
              <p>
                Invoices included: {forecast.invoicesIncluded}
              </p>
              <p className="mt-2">
                Invoices excluded: {forecast.invoicesExcluded}
              </p>

              <p className="mt-4 text-xs text-muted">
                Forecast receipts assume 80% collection of eligible
                invoices. This is an estimate, not a guarantee.
              </p>

              <Link
                href="/invoices"
                className="mt-4 inline-block font-medium text-brand-700 hover:underline"
              >
                Review invoices
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}