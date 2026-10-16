import { db } from "@/lib/db";
import { addDaysIso, isoDate, todayIn } from "@/lib/dates";

export type ForecastPoint = {
  date: string;
  openingBalance: number;
  expectedReceipts: number;
  plannedExpenses: number;
  closingBalance: number;
};

//builds a cash flow forecast for a given company over a specified horizon, taking into account starting cash, monthly expenses, and expected receipts from invoices.

export async function buildCashFlowForecast(
  companyId: number,
  timeZone: string,
  startingCashCents: number,
  monthlyExpensesCents: number,
  horizonDays: number,
) {
  const today = todayIn(timeZone);
  const end = addDaysIso(today, horizonDays);

  const invoices = await db.invoice.findMany({
    where: {
      companyId,
      type: "INVOICE",
      status: { not: "DRAFT" },
      baseDueAmount: { gt: 0 },
    },
    select: {
      id: true,
      dueDate: true,
      baseDueAmount: true,
    },
  });

  const receiptsByDate = new Map<string, number>();
  let invoicesIncluded = 0;
  let invoicesExcluded = 0;

  for (const invoice of invoices) {
    const dueDate = invoice.dueDate
      ? isoDate(invoice.dueDate)
      : null;

    // Only forecast invoices due within the selected period.
    if (!dueDate || dueDate < today || dueDate > end) {
      invoicesExcluded++;
      continue;
    }

    // Conservative assumption: 80% of the outstanding amount arrives.
    const expected = Math.round(
      Number(invoice.baseDueAmount) * 0.8,
    );

    receiptsByDate.set(
      dueDate,
      (receiptsByDate.get(dueDate) ?? 0) + expected,
    );

    invoicesIncluded++;
  }

  const checkpoints = [today];

  for (let day = 7; day < horizonDays; day += 7) {
    checkpoints.push(addDaysIso(today, day));
  }

  if (checkpoints[checkpoints.length - 1] !== end) {
    checkpoints.push(end);
  }

  const points: ForecastPoint[] = [];
  let balance = startingCashCents;
  let previousDate = today;

  let incomingTotal = 0;
  let expenseTotal = 0;

  for (const date of checkpoints) {
    let receipts = 0;
    let expenses = 0;

    // Count each calendar day exactly once.
    let currentDate = previousDate;

    while (currentDate <= date) {
      receipts += receiptsByDate.get(currentDate) ?? 0;

      expenses += Math.round(
        monthlyExpensesCents / 30.4375,
      );

      currentDate = addDaysIso(currentDate, 1);
    }

    const openingBalance = balance;

    balance += receipts - expenses;

    incomingTotal += receipts;
    expenseTotal += expenses;

    points.push({
      date,
      openingBalance,
      expectedReceipts: receipts,
      plannedExpenses: expenses,
      closingBalance: balance,
    });

    previousDate = addDaysIso(date, 1);
  }

  const lowestBalance = points.reduce((lowest, point) =>
    point.closingBalance < lowest.closingBalance
      ? point
      : lowest,
  );

  return {
    today,
    horizonDays,
    startingCash: startingCashCents,
    monthlyExpenses: monthlyExpensesCents,
    points,
    lowestBalance,
    projectedEndBalance: balance,
    incomingTotal,
    expenseTotal,
    invoicesIncluded,
    invoicesExcluded,
  };
}