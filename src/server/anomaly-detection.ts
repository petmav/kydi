import { db } from "@/lib/db";

export type AnomalySeverity = "high" | "medium" | "low";

export type Anomaly = {
  id: string;
  type:
    | "possible_duplicate_invoice"
    | "possible_duplicate_expense"
    | "unusual_price_change"
    | "invoice_total_mismatch";
  severity: AnomalySeverity;
  title: string;
  description: string;
  recordType: "invoice" | "expense";
  recordId: number;
  amount?: number;
};

type ExpenseRecord = {
  id: number;
  amount: bigint;
  categoryName: string;
  notes: string | null;
  expenseDate: Date;
};

export async function detectFinancialAnomalies(
  companyId: number,
): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];

  // Fetch records for this company only.
  const [invoices, expenses] = await Promise.all([
    db.invoice.findMany({
      where: {
        companyId,
        type: "INVOICE",
        status: { not: "DRAFT" },
      },
      select: {
        id: true,
        invoiceNumber: true,
        customerId: true,
        baseTotal: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),

    db.expense.findMany({
      where: { companyId },
      select: {
        id: true,
        amount: true,
        category: { select: { name: true } },
        notes: true,
        expenseDate: true,
      },
      orderBy: { expenseDate: "desc" },
      take: 500,
    }),
  ]);
  const expenseRecords: ExpenseRecord[] = expenses.map((expense) => ({
    id: expense.id,
    amount: expense.amount,
    categoryName: expense.category.name,
    notes: expense.notes,
    expenseDate: expense.expenseDate,
  }));

  // Rule 1: Possible duplicate invoices.
  // Same customer, same total, created within 7 days.
  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < invoices.length; j++) {
      const a = invoices[i];
      const b = invoices[j];

      const daysApart = Math.abs(
        a.createdAt.getTime() - b.createdAt.getTime(),
      ) / (1000 * 60 * 60 * 24);

      if (
        a.customerId !== null &&
        a.customerId === b.customerId &&
        Number(a.baseTotal) === Number(b.baseTotal) &&
        daysApart <= 7
      ) {
        anomalies.push({
          id: `duplicate-invoice-${a.id}-${b.id}`,
          type: "possible_duplicate_invoice",
          severity: "high",
          title: "Possible duplicate invoices",
          description:
            `Invoices ${a.invoiceNumber} and ${b.invoiceNumber} ` +
            "have the same customer and total and were created close together.",
          recordType: "invoice",
          recordId: a.id,
          amount: Number(a.baseTotal),
        });
      }
    }
  }

  // Rule 2: Possible duplicate expenses with matching category, notes and date.
  for (let i = 0; i < expenseRecords.length; i++) {
    for (let j = i + 1; j < expenseRecords.length; j++) {
      const a = expenseRecords[i];
      const b = expenseRecords[j];
      const notes = (a.notes ?? "").trim().toLowerCase();

      const sameCategory = a.categoryName === b.categoryName;
      const sameNotes =
        notes !== "" && notes === (b.notes ?? "").trim().toLowerCase();

      const sameDate =
        a.expenseDate.toISOString().slice(0, 10) ===
        b.expenseDate.toISOString().slice(0, 10);

      if (
        sameCategory &&
        sameNotes &&
        sameDate &&
        Number(a.amount) === Number(b.amount)
      ) {
        anomalies.push({
          id: `duplicate-expense-${a.id}-${b.id}`,
          type: "possible_duplicate_expense",
          severity: "high",
          title: "Possible duplicate expense",
          description:
            `Two ${a.categoryName} expenses with the same notes have the same amount ` +
            "and date. Check whether both entries are valid.",
          recordType: "expense",
          recordId: a.id,
          amount: Number(a.amount),
        });
      }
    }
  }

  // Rule 3: Unusual price changes.
  // Compare expenses with the same category and notes.
  for (const current of expenseRecords) {
    const notes = (current.notes ?? "")
      .trim()
      .toLowerCase();

    if (!notes) continue;

    const previous = expenseRecords.find((candidate) => {
      if (candidate.id === current.id) return false;

      const sameNotes =
        (candidate.notes ?? "").trim().toLowerCase() === notes;

      return (
        candidate.categoryName === current.categoryName &&
        sameNotes &&
        candidate.expenseDate < current.expenseDate &&
        Number(candidate.amount) > 0
      );
    });

    if (!previous) continue;

    const oldAmount = Number(previous.amount);
    const newAmount = Number(current.amount);
    const change = (newAmount - oldAmount) / oldAmount;

    if (change >= 0.3) {
      anomalies.push({
        id: `price-change-${current.id}-${previous.id}`,
        type: "unusual_price_change",
        severity: change >= 0.75 ? "high" : "medium",
        title: "Unusual expense increase",
        description:
          `A ${current.categoryName} expense with the same notes was ` +
          `${Math.round(change * 100)}% higher than the previous recorded amount.`,
        recordType: "expense",
        recordId: current.id,
        amount: newAmount,
      });
    }
  }

  return anomalies;
}