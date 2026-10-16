import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import { addDaysIso } from "@/lib/dates";
import type { SeedRefs } from "./seed";
import { savePayment } from "./payments";

/** Additional demo data (payments, expenses, recurring) added by later modules. */
export async function seedExtras(ctx: CompanyContext, refs: SeedRefs): Promise<void> {
  const methods = await db.paymentMethod.findMany({ where: { companyId: ctx.companyId } });
  const plan: [number, number, number][] = [
    // [invoice index, fraction paid, days after invoice date]
    [0, 1, 12],
    [1, 1, 20],
    [2, 0.5, 15],
    [3, 1, 10],
    [4, 0.6, 18],
    [5, 1, 9],
    [6, 0.4, 14],
    [7, 1, 6],
  ];
  for (const [idx, frac, after] of plan) {
    const inv = await db.invoice.findUnique({ where: { id: refs.invoices[idx] } });
    if (!inv) continue;
    const amount = Math.round(Number(inv.total) * frac);
    const date = addDaysIso(inv.invoiceDate.toISOString().slice(0, 10), after);
    const r = await savePayment(
      ctx,
      null,
      {
        customerId: inv.customerId,
        paymentDate: date > refs.today ? refs.today : date,
        paymentNumber: "",
        amount,
        exchangeRate: inv.currency === ctx.settings.currency ? 1 : 1.1,
        paymentMethodId: methods[idx % methods.length].id,
        notes: null,
        allocations: [{ invoiceId: inv.id, amount }],
        minor: true,
      },
      {},
    );
    if (!r.ok) throw new Error(`seed payment failed: ${r.error} ${JSON.stringify(r.fieldErrors)}`);
  }
  // An unapplied payment so "Apply credit" has something to work with.
  await savePayment(ctx, null, { customerId: refs.customers[0].id, paymentDate: addDaysIso(refs.today, -2), paymentNumber: "", amount: 50000, exchangeRate: 1, paymentMethodId: methods[3]?.id ?? null, notes: null, allocations: [], minor: true }, {});
}
