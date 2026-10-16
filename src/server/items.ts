import { z } from "zod";
import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth/context";
import type { FieldErrors } from "@/lib/action";
import { MAX_MONEY, toMinor } from "@/lib/money";
import { saveCustomFieldAnswers, validateCustomFieldAnswers } from "@/lib/custom-fields";

export const itemSchema = z.object({
  name: z.string().trim().min(3, "Use at least 3 characters.").max(255),
  description: z
    .string()
    .trim()
    .max(65000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  /** Major units in forms ("12.50"); minor units (integer) in the API. */
  price: z.union([z.string(), z.number()]),
  priceIsMinor: z.boolean().optional(),
  unitId: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v))),
  taxes: z
    .union([z.string(), z.array(z.union([z.string(), z.number()]))])
    .optional()
    .transform((v) => [v ?? []].flat().map(Number).filter((n) => Number.isInteger(n) && n > 0)),
});

export type ItemInput = z.infer<typeof itemSchema>;
type Result = { ok: true; id: number } | { ok: false; error: string; fieldErrors?: FieldErrors; status?: number };

export async function saveItem(ctx: CompanyContext, id: number | null, input: ItemInput, cfSource: FormData | Record<string, unknown>): Promise<Result> {
  const price = input.priceIsMinor ? Number(input.price) : toMinor(input.price);
  if (!Number.isInteger(price) || price < 0 || price > MAX_MONEY) return { ok: false, error: "Enter a valid price.", fieldErrors: { price: ["Enter a price of 0 or more."] } };
  if (input.unitId && !(await db.unit.findFirst({ where: { id: input.unitId, companyId: ctx.companyId } }))) {
    return { ok: false, error: "Choose a valid unit.", fieldErrors: { unitId: ["Choose a valid unit."] } };
  }
  const taxIds = input.taxes;
  if (taxIds.length) {
    const valid = await db.taxType.count({ where: { id: { in: taxIds }, companyId: ctx.companyId, transactionType: "SALES" } });
    if (valid !== new Set(taxIds).size) return { ok: false, error: "Choose valid sales taxes.", fieldErrors: { taxes: ["Choose valid sales taxes."] } };
  }
  const existing = id ? await db.item.findFirst({ where: { id, companyId: ctx.companyId } }) : null;
  if (id && !existing) return { ok: false, error: "Item not found.", status: 404 };
  const cf = await validateCustomFieldAnswers(ctx.companyId, "Item", cfSource);
  if (!cf.ok) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: cf.errors };

  const data = { name: input.name, description: input.description, price, unitId: input.unitId };
  const item = await db.$transaction(async (tx) => {
    const it = existing ? await tx.item.update({ where: { id: existing.id }, data }) : await tx.item.create({ data: { ...data, companyId: ctx.companyId, creatorId: ctx.user.id } });
    await tx.itemTax.deleteMany({ where: { itemId: it.id } });
    if (taxIds.length) await tx.itemTax.createMany({ data: [...new Set(taxIds)].map((taxTypeId) => ({ itemId: it.id, taxTypeId })) });
    await saveCustomFieldAnswers(tx, ctx.companyId, "Item", it.id, cf.values);
    return it;
  });
  return { ok: true, id: item.id };
}

/** Items are snapshots on documents, so deletion is always allowed (lines keep their copy). */
export async function deleteItems(ctx: CompanyContext, ids: number[]): Promise<number> {
  const res = await db.item.deleteMany({ where: { id: { in: ids }, companyId: ctx.companyId } });
  await db.customFieldValue.deleteMany({ where: { companyId: ctx.companyId, modelType: "Item", modelId: { in: ids } } });
  return res.count;
}
