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

type InvoiceRecord = {
  id: number;
  invoiceNumber: string;
  customerId: number | null;
  baseTotal: number;
  createdAt: Date;
};

type ExpenseRecord = {
  id: number;
  amount: number;
  vendor: string | null;
  description: string | null;
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
        vendor: true,
        description: true,
        expenseDate: true,
      },
      orderBy: { expenseDate: "desc" },
      take: 500,
    }),
  ]);

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

  // Rule 2: Possible duplicate expenses.
  // Same vendor, amount and date.
  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i];
      const b = expenses[j];

      const sameVendor =
        (a.vendor ?? "").trim().toLowerCase() !== "" &&
        (a.vendor ?? "").trim().toLowerCase() ===
          (b.vendor ?? "").trim().toLowerCase();

      const sameDate =
        a.expenseDate.toISOString().slice(0, 10) ===
        b.expenseDate.toISOString().slice(0, 10);

      if (
        sameVendor &&
        sameDate &&
        Number(a.amount) === Number(b.amount)
      ) {
        anomalies.push({
          id: `duplicate-expense-${a.id}-${b.id}`,
          type: "possible_duplicate_expense",
          severity: "high",
          title: "Possible duplicate expense",
          description:
            `Two expenses for ${a.vendor} have the same amount ` +
            "and date. Check whether both entries are valid.",
          recordType: "expense",
          recordId: a.id,
          amount: Number(a.amount),
        });
      }
    }
  }

  // Rule 3: Unusual price changes.
  // Compare expenses from the same vendor with similar descriptions.
  for (const current of expenses) {
    const description = (current.description ?? "")
      .trim()
      .toLowerCase();

    if (!description) continue;

    const previous = expenses.find((candidate) => {
      if (candidate.id === current.id) return false;

      const sameVendor =
        (candidate.vendor ?? "").trim().toLowerCase() ===
        (current.vendor ?? "").trim().toLowerCase();

      const sameDescription =
        (candidate.description ?? "").trim().toLowerCase() ===
        description;

      return (
        sameVendor &&
        sameDescription &&
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
          `${current.vendor ?? "This vendor"} charged ` +
          `${Math.round(change * 100)}% more for a similar expense ` +
          "than the previous recorded amount.",
        recordType: "expense",
        recordId: current.id,
        amount: newAmount,
      });
    }
  }

  return anomalies;
}