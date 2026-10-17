import { db, type Tx } from "@/lib/db";
import { getCompanySettings } from "@/lib/settings";
import { renderNumber } from "@/domain/numbering";
import { todayIn } from "@/lib/dates";

export type NumberKind = "invoice" | "credit_note" | "estimate" | "payment";

async function maxSeq(tx: Tx, companyId: number, kind: NumberKind, customerId?: number) {
  const where = { companyId, ...(customerId ? { customerId } : {}) };
  const select = { sequenceNumber: true, customerSequenceNumber: true } as const;
  let max: { sequenceNumber: number | null; customerSequenceNumber: number | null };
  if (kind === "estimate") max = (await tx.estimate.aggregate({ where, _max: select }))._max;
  else if (kind === "payment") max = (await tx.payment.aggregate({ where, _max: select }))._max;
  else max = (await tx.invoice.aggregate({ where: { ...where, type: kind === "credit_note" ? "CREDIT_NOTE" : "INVOICE" }, _max: select }))._max;
  return (customerId ? max.customerSequenceNumber : max.sequenceNumber) ?? 0;
}

/** Next company/customer sequences and the rendered number (spec §3.21). */
export async function nextNumber(companyId: number, kind: NumberKind, customerId: number | null, tx: Tx = db) {
  const settings = await getCompanySettings(companyId);
  const format = settings[`${kind}_number_format`];
  const sequence = (await maxSeq(tx, companyId, kind)) + 1;
  const customerSequence = customerId ? (await maxSeq(tx, companyId, kind, customerId)) + 1 : 1;
  const customer = customerId ? await tx.customer.findUnique({ where: { id: customerId }, select: { prefix: true } }) : null;
  const [y, m, d] = todayIn(settings.time_zone).split("-").map(Number);
  const number = renderNumber(format, { sequence, customerSequence, customerPrefix: customer?.prefix, date: new Date(y, m - 1, d) });
  return { number, sequence, customerSequence };
}
