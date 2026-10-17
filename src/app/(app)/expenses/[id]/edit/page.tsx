import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { getCompanyContext, parseId } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { isoDate } from "@/lib/dates";
import { minorToInput } from "@/lib/money";
import { loadCustomFieldAnswers } from "@/lib/custom-fields";
import { saveExpenseAction } from "../../actions";
import { expenseFormData } from "../../form-data";

export const metadata: Metadata = { title: "Edit expense" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("edit-expense")) return <Forbidden />;
  const id = parseId((await params).id);
  const e = await db.expense.findFirst({ where: { id, companyId: ctx.companyId }, include: { taxes: true } });
  if (!e) notFound();
  const data = await expenseFormData(ctx);
  return (
    <>
      <PageHeader title="Edit expense" back={<Link href="/expenses" className="text-brand-700 hover:underline focus-ring rounded">← Expenses</Link>} />
      <ExpenseForm
        action={saveExpenseAction.bind(null, e.id)}
        {...data}
        initial={{
          expenseDate: isoDate(e.expenseDate),
          expenseNumber: e.expenseNumber ?? "",
          categoryId: String(e.categoryId),
          amount: minorToInput(e.amount),
          currency: e.currency,
          exchangeRate: String(e.exchangeRate),
          supplierId: e.supplierId ? String(e.supplierId) : "", customerId: e.customerId ? String(e.customerId) : "",
          paymentMethodId: e.paymentMethodId ? String(e.paymentMethodId) : "",
          notes: e.notes ?? "",
          taxes: e.taxes.map((t) => ({ taxTypeId: String(t.taxTypeId), amount: minorToInput(t.amount) })),
        }}
        receipt={e.receiptPath ? { name: e.receiptName ?? "Receipt", url: `/api/files/receipt/${e.id}` } : null}
        customValues={await loadCustomFieldAnswers("Expense", e.id)}
        isNew={false}
      />
    </>
  );
}
