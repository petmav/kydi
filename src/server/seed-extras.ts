import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import { addDaysIso } from "@/lib/dates";
import type { SeedRefs } from "./seed";
import { savePayment } from "./payments";
import { saveExpense } from "./expenses";
import { saveRecurring } from "./recurring";

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

  const cats = await db.expenseCategory.findMany({ where: { companyId: ctx.companyId } });
  const spend: [string, number, number, string][] = [
    ["Software", 4900, 330, "Design tool subscription"],
    ["Software", 4900, 300, "Design tool subscription"],
    ["Travel", 38750, 280, "Client workshop flights"],
    ["Meals", 8640, 279, "Team lunch with client"],
    ["Office supplies", 12999, 220, "Monitor arm and cables"],
    ["Contractors", 150000, 180, "Illustration subcontract"],
    ["Software", 4900, 150, "Design tool subscription"],
    ["Travel", 21500, 95, "Train tickets"],
    ["Contractors", 90000, 60, "Copywriting"],
    ["Software", 4900, 30, "Design tool subscription"],
    ["Meals", 4320, 12, "Coffee meeting"],
    ["Office supplies", 3499, 4, "Printer paper"],
  ];
  for (const [cat, amount, daysAgo, notes] of spend) {
    const c = cats.find((x) => x.name === cat)!;
    const r = await saveExpense(ctx, null, { expenseDate: addDaysIso(refs.today, -daysAgo), expenseNumber: null, categoryId: c.id, amount, currency: ctx.settings.currency, exchangeRate: 1, customerId: null, supplierId: null, paymentMethodId: methods[2]?.id ?? null, notes, taxes: cat === "Office supplies" ? [{ taxTypeId: refs.taxes.input, amount: Math.round(amount / 6) }] : [], removeReceipt: false, minor: true }, null, {});
    if (!r.ok) throw new Error("seed expense failed: " + r.error);
  }

  const hosting = await db.item.findFirst({ where: { companyId: ctx.companyId, name: "Hosting (monthly)" } });
  if (hosting) {
    const r = await saveRecurring(
      ctx,
      null,
      { customerId: refs.customers[1].id, date: "", closingDate: null, number: "", referenceNumber: null, exchangeRate: 1, discountType: "FIXED", discount: 0, taxIncluded: false, notes: "<p>Monthly managed hosting.</p>", templateName: "invoice1", taxes: [refs.taxes.salesTax], lines: [{ itemId: hosting.id, name: hosting.name, description: hosting.description, unitName: null, quantity: 1, price: "49.00", discountType: "FIXED", discount: 0, taxes: [] }] },
      { startsAt: addDaysIso(refs.today, -40), frequency: "0 0 1 * *", limitBy: "NONE", status: "ACTIVE", sendAutomatically: false, notifyCreator: false },
      {},
    );
    if (!r.ok) throw new Error("seed recurring failed: " + r.error);
  }
}
