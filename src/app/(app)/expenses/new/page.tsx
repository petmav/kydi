import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { getCompanyContext } from "@/lib/auth/context";
import { todayIn } from "@/lib/dates";
import type { SearchParams } from "@/lib/list";
import { saveExpenseAction } from "../actions";
import { expenseFormData } from "../form-data";

export const metadata: Metadata = { title: "New expense" };

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getCompanyContext();
  if (!ctx.can("create-expense")) return <Forbidden />;
  const sp = await searchParams;
  const data = await expenseFormData(ctx);
  return (
    <>
      <PageHeader title="New expense" back={<Link href="/expenses" className="text-brand-700 hover:underline focus-ring rounded">← Expenses</Link>} />
      <ExpenseForm
        action={saveExpenseAction.bind(null, null)}
        {...data}
        initial={{ expenseDate: todayIn(ctx.settings.time_zone), expenseNumber: "", categoryId: "", amount: "", currency: ctx.settings.currency, exchangeRate: "", customerId: typeof sp.customer === "string" ? sp.customer : "", paymentMethodId: "", notes: "", taxes: [] }}
        receipt={null}
        isNew
      />
    </>
  );
}
