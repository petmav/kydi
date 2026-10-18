import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";

import {
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@/components/ui/primitives";

import { buttonClass } from "@/components/ui/button";
import { Forbidden } from "@/components/forbidden";
import { getCompanyContext } from "@/lib/auth/context";
import { formatMoney } from "@/lib/money";
import { detectFinancialAnomalies } from "@/server/anomaly-detection";

export const metadata = {
  title: "Financial anomaly detection",
};

type SearchParams = {
  severity?: string;
};

export default async function AnomaliesPage({
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

  const validSeverities = ["all", "high", "medium", "low"];

  const severity = validSeverities.includes(
    params.severity ?? "all",
  )
    ? params.severity ?? "all"
    : "all";

  const anomalies = await detectFinancialAnomalies(
    ctx.companyId,
  );

  const filtered = anomalies.filter(
    (anomaly) =>
      severity === "all" || anomaly.severity === severity,
  );

  const money = (amount: number) =>
    formatMoney(
      Math.round(amount * 100),
      ctx.settings.currency,
      ctx.settings.locale,
    );

  const highCount = anomalies.filter(
    (a) => a.severity === "high",
  ).length;

  const mediumCount = anomalies.filter(
    (a) => a.severity === "medium",
  ).length;

  return (
    <>
      <PageHeader
        title="Financial anomaly detection"
        description="Review unusual financial records and possible data-entry mistakes."
        actions={
          <Link
            href="/dashboard"
            className={buttonClass("secondary", "sm")}
          >
            Dashboard
          </Link>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-sm text-muted">
              Total flags
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {anomalies.length}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-sm text-muted">
              High priority
            </p>
            <p className="mt-2 text-2xl font-semibold text-red-600">
              {highCount}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-sm text-muted">
              Needs review
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {mediumCount}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6" data-tour="anomaly-results">
        <CardHeader
          title="Flagged records"
          description="A flag indicates something worth checking, not necessarily an error."
        />

        <CardBody>
          <form method="get" className="mb-6 flex gap-3" data-tour="anomaly-filter">
            <select
              name="severity"
              defaultValue={severity}
              className="rounded-md border p-2 text-sm"
              aria-label="Filter by severity"
            >
              <option value="all">All severities</option>
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>

            <button
              type="submit"
              className={buttonClass("secondary", "md")}
            >
              Filter
            </button>
          </form>

          {filtered.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />

              <p className="mt-3 font-semibold">
                No anomalies found
              </p>

              <p className="mt-1 text-sm text-muted">
                No records matched the selected filter.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((anomaly) => (
                <div
                  key={anomaly.id}
                  className="rounded-lg border border-line p-4"
                >
                  <div className="flex items-start gap-3">
                    {anomaly.severity === "high" ? (
                      <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-red-600" />
                    ) : (
                      <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">
                          {anomaly.title}
                        </h3>

                        <span
                          className={`rounded px-2 py-1 text-xs font-medium ${
                            anomaly.severity === "high"
                              ? "bg-red-50 text-red-700"
                              : anomaly.severity === "medium"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {anomaly.severity}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-muted">
                        {anomaly.description}
                      </p>

                      {anomaly.amount !== undefined && (
                        <p className="mt-2 text-sm font-medium">
                          Amount: {money(anomaly.amount)}
                        </p>
                      )}

                      <p className="mt-2 text-xs text-muted">
                        Record: {anomaly.recordType} #{anomaly.recordId}
                      </p>

                      <Link
                        href={
                          anomaly.recordType === "invoice"
                            ? "/invoices"
                            : "/expenses"
                        }
                        className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
                      >
                        Review {anomaly.recordType}
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}