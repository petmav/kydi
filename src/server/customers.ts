import { checkPasswordPolicy } from "@/lib/auth/password-policy";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import type { FieldErrors } from "@/lib/action";
import { hashPassword } from "@/lib/auth/password";
import { isCurrency } from "@/lib/intl-data";
import { saveCustomFieldAnswers, validateCustomFieldAnswers } from "@/lib/custom-fields";

const opt = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const ADDRESS_KEYS = ["Name", "Street1", "Street2", "City", "State", "Country", "Zip", "Phone"] as const;
const addressShape = (prefix: "billing" | "shipping") =>
  Object.fromEntries(ADDRESS_KEYS.map((k) => [`${prefix}${k}`, opt()])) as Record<`${typeof prefix}${(typeof ADDRESS_KEYS)[number]}`, ReturnType<typeof opt>>;

export const customerSchema = z
  .object({
    name: z.string().trim().min(3, "Use at least 3 characters.").max(255),
    contactName: opt(),
    companyName: opt(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(255)
      .optional()
      .nullable()
      .refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email address.")
      .transform((v) => (v ? v : null)),
    phone: opt(),
    website: z
      .string()
      .trim()
      .max(255)
      .optional()
      .nullable()
      .refine((v) => {
        if (!v) return true;
        try {
          const u = new URL(v);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch {
          return false;
        }
      }, "Enter a valid URL, including https://.")
      .transform((v) => (v ? v : null)),
    prefix: opt(10),
    taxId: opt(),
    currency: z.string().refine(isCurrency, "Choose a currency."),
    enablePortal: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
    password: z.string().optional().nullable(),
    confirm: z.string().optional().nullable(),
    ...addressShape("billing"),
    ...addressShape("shipping"),
  })
  .superRefine((d, c) => {
    { const weak = d.password ? checkPasswordPolicy(d.password) : null; if (weak) c.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: weak }); }
    if (d.password && d.confirm !== undefined && d.confirm !== null && d.password !== d.confirm) {
      c.addIssue({ code: z.ZodIssueCode.custom, path: ["confirm"], message: "Passwords do not match." });
    }
  });

export type CustomerInput = z.infer<typeof customerSchema>;

export async function customerHasActivity(customerId: number): Promise<boolean> {
  const [i, e, p, r] = await Promise.all([
    db.invoice.count({ where: { customerId } }),
    db.estimate.count({ where: { customerId } }),
    db.payment.count({ where: { customerId } }),
    db.recurringInvoice.count({ where: { customerId } }),
  ]);
  return i + e + p + r > 0;
}

export type SaveResult = { ok: true; id: number } | { ok: false; error: string; fieldErrors?: FieldErrors; status?: number };

export async function saveCustomer(
  ctx: CompanyContext,
  id: number | null,
  input: CustomerInput,
  customFieldSource: FormData | Record<string, unknown>,
): Promise<SaveResult> {
  const existing = id ? await db.customer.findFirst({ where: { id, companyId: ctx.companyId }, omit: { portalPasswordHash: false } }) : null;
  if (id && !existing) return { ok: false, error: "Customer not found.", status: 404 };

  if (input.email) {
    const dup = await db.customer.findFirst({ where: { companyId: ctx.companyId, email: input.email, NOT: id ? { id } : undefined } });
    if (dup) return { ok: false, error: "Another customer already uses this email.", fieldErrors: { email: ["This email is already used by another customer."] } };
  }
  if (existing && existing.currency !== input.currency && (await customerHasActivity(existing.id))) {
    return { ok: false, error: "you_cannot_edit_currency", fieldErrors: { currency: ["Currency is locked once the customer has documents or payments."] } };
  }
  if (input.enablePortal && !input.email) {
    return { ok: false, error: "Portal access requires an email address.", fieldErrors: { email: ["Required when portal access is enabled."] } };
  }
  if (input.enablePortal && !input.password && !existing?.portalPasswordHash) {
    return { ok: false, error: "Set a portal password.", fieldErrors: { password: ["Required when enabling portal access."] } };
  }

  const cf = await validateCustomFieldAnswers(ctx.companyId, "Customer", customFieldSource);
  if (!cf.ok) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: cf.errors };

  const { password, confirm: _confirm, ...rest } = input;
  void _confirm;
  const data: Prisma.CustomerUncheckedCreateInput = {
    ...rest,
    companyId: ctx.companyId,
    ...(password ? { portalPasswordHash: await hashPassword(password) } : {}),
  };
  const saved = await db.$transaction(async (tx) => {
    const c = existing
      ? await tx.customer.update({ where: { id: existing.id }, data })
      : await tx.customer.create({ data: { ...data, creatorId: ctx.user.id } });
    await saveCustomFieldAnswers(tx, ctx.companyId, "Customer", c.id, cf.values);
    return c;
  });
  return { ok: true, id: saved.id };
}

/** Deletes customers and (cascade) all their documents, payments and expenses (spec §3.5). */
export async function deleteCustomers(ctx: CompanyContext, ids: number[]): Promise<number> {
  const owned = await db.customer.findMany({ where: { id: { in: ids }, companyId: ctx.companyId }, select: { id: true } });
  const ownedIds = owned.map((o) => o.id);
  if (!ownedIds.length) return 0;
  await db.$transaction(async (tx) => {
    // Allocations restrict invoice deletion; remove them first, then cascade from customers.
    await tx.paymentAllocation.deleteMany({ where: { OR: [{ invoice: { customerId: { in: ownedIds } } }, { payment: { customerId: { in: ownedIds } } }] } });
    const invoiceIds = (await tx.invoice.findMany({ where: { customerId: { in: ownedIds } }, select: { id: true } })).map((i) => i.id);
    await tx.customFieldValue.deleteMany({ where: { OR: [{ modelType: "Customer", modelId: { in: ownedIds } }, { modelType: "Invoice", modelId: { in: invoiceIds } }] } });
    await tx.customer.deleteMany({ where: { id: { in: ownedIds } } });
  });
  return ownedIds.length;
}

/** Due (sum of open invoice balances) and available credit (unapplied payments), in customer currency and base. */
export async function customerBalances(companyId: number, customerIds: number[]) {
  if (!customerIds.length) return new Map<number, { due: number; baseDue: number; credit: number }>();
  const [dues, pays, allocs] = await Promise.all([
    db.invoice.groupBy({
      by: ["customerId"],
      where: { companyId, customerId: { in: customerIds }, type: "INVOICE", status: { not: "DRAFT" } },
      _sum: { dueAmount: true, baseDueAmount: true },
    }),
    db.payment.groupBy({ by: ["customerId"], where: { companyId, customerId: { in: customerIds } }, _sum: { amount: true } }),
    db.paymentAllocation.findMany({ where: { payment: { companyId, customerId: { in: customerIds } } }, select: { amount: true, payment: { select: { customerId: true } } } }),
  ]);
  const out = new Map<number, { due: number; baseDue: number; credit: number }>();
  for (const id of customerIds) out.set(id, { due: 0, baseDue: 0, credit: 0 });
  for (const d of dues) Object.assign(out.get(d.customerId)!, { due: Number(d._sum.dueAmount ?? 0), baseDue: Number(d._sum.baseDueAmount ?? 0) });
  for (const p of pays) out.get(p.customerId)!.credit += Number(p._sum.amount ?? 0);
  for (const a of allocs) out.get(a.payment.customerId)!.credit -= Number(a.amount);
  return out;
}
