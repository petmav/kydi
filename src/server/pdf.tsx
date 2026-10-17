import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { getCompanySettings, type CompanySettings } from "@/lib/settings";
import { countryName } from "@/lib/intl-data";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDate } from "@/lib/dates";
import { companyValues, customerValues, fillPlaceholders } from "@/lib/placeholders";
import { customFieldPlaceholders, displayAnswer, getCustomFields, lineFieldsFrom, loadCustomFieldAnswers } from "@/lib/custom-fields";
import { extensionOf, readStoredFile } from "@/lib/storage";
import { taxSummary } from "@/domain/totals";
import { DocumentPdf, type PdfDoc } from "@/pdf/document-pdf";
import { SimplePdf, type SimplePdfData } from "@/pdf/simple-pdf";
import { htmlToBlocks, pdfText } from "@/pdf/html";
import { portalInfoFor } from "./portal-access";

type Company = NonNullable<Awaited<ReturnType<typeof db.company.findUnique>>>;

export async function companyAssets(companyId: number) {
  const company = (await db.company.findUnique({ where: { id: companyId } }))!;
  const settings = await getCompanySettings(companyId);
  let logo: Buffer | null = null;
  if (company.logoPath && ["png", "jpg", "jpeg"].includes(extensionOf(company.logoPath))) logo = await readStoredFile(company.logoPath);
  return { company, settings, logo };
}

const fmt = (settings: CompanySettings, currency: string) => (v: number | bigint) => pdfText(formatMoney(Number(v), currency, settings.locale));
/** Item custom fields with placement "document" print as extra line columns when any line has an answer (spec §7.2). */
async function lineColumns(companyId: number, lines: { customFields: unknown }[]) {
  const answers = (l: { customFields: unknown }) => (l.customFields && typeof l.customFields === "object" ? (l.customFields as Record<string, string>) : {});
  const fields = lineFieldsFrom(await getCustomFields(companyId, "Item")).filter((f) => lines.some((l) => answers(l)[String(f.id)]));
  return {
    extraColumns: fields.map((f) => pdfText(f.label)),
    extraFor: (l: { customFields: unknown }) => fields.map((f) => pdfText(displayAnswer(f, answers(l)[String(f.id)] ?? null))),
  };
}

const qtyText = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2));

async function placeholderValues(company: Company, customer: Record<string, unknown> & { id: number; name: string }, docValues: Record<string, string>, model: "Invoice" | "Estimate" | "Payment", modelId: number) {
  return {
    ...companyValues(company, countryName),
    ...customerValues(customer, countryName),
    CONTACT_TAX_ID: customer.taxId ? `Tax ID: ${customer.taxId}` : "",
    ...docValues,
    ...(await customFieldPlaceholders(company.id, "Customer", customer.id)),
    ...(await customFieldPlaceholders(company.id, model, modelId)),
  };
}

/** Portal box on invoice PDFs: only when the customer already has portal access (drafts stay silent). */
async function invoicePortal(company: Company, customer: { id: number; email: string | null; enablePortal: boolean; portalOptOut: boolean }): Promise<PdfDoc["portal"]> {
  if (!customer.enablePortal) return null;
  const p = await portalInfoFor(company, customer);
  return p ? { url: p.loginUrl, displayUrl: pdfText(p.displayUrl), email: pdfText(p.email) } : null;
}

export async function invoicePdfData(companyId: number, invoiceId: number): Promise<PdfDoc | null> {
  const inv = await db.invoice.findFirst({
    where: { id: invoiceId, companyId },
    include: { customer: true, lines: { include: { taxes: true }, orderBy: { position: "asc" } }, taxes: { where: { lineItemId: null }, orderBy: { position: "asc" } }, creditNotes: true, relatedInvoice: true, allocations: true },
  });
  if (!inv) return null;
  const { company, settings, logo } = await companyAssets(companyId);
  const money = fmt(settings, inv.currency);
  const df = (d: Date | null) => (d ? formatDate(isoDate(d), settings.date_format) : "");
  const isCredit = inv.type === "CREDIT_NOTE";
  const values = await placeholderValues(
    company,
    inv.customer,
    { INVOICE_NUMBER: inv.invoiceNumber, INVOICE_DATE: df(inv.invoiceDate), INVOICE_DUE_DATE: df(inv.dueDate), INVOICE_REF_NUMBER: inv.referenceNumber ?? "" },
    "Invoice",
    inv.id,
  );
  const docFields = (await getCustomFields(companyId, "Invoice")).filter((f) => f.placement === "document");
  const cols = await lineColumns(companyId, inv.lines);
  const answers = await loadCustomFieldAnswers("Invoice", inv.id);
  const paid = inv.allocations.reduce((s, a) => s + Number(a.amount), 0);
  const credited = Math.abs(inv.creditNotes.reduce((s, c) => s + Number(c.total), 0));
  const summary = taxSummary({ lines: inv.lines.map((l) => ({ taxes: l.taxes.map((t) => ({ ...t, amount: Number(t.amount), fixedAmount: null, baseAmount: 0 })) })), taxes: inv.taxes.map((t) => ({ ...t, amount: Number(t.amount), fixedAmount: null, baseAmount: 0 })) }, inv.taxPerItem);
  let banner: string[] | null = null;
  if (isCredit) {
    banner = ["Credit note", `For invoice ${inv.relatedInvoice?.invoiceNumber ?? inv.referenceNumber ?? ""}${inv.relatedInvoice ? ` dated ${df(inv.relatedInvoice.invoiceDate)}` : ""}`, ...(inv.creditReason ? [`Reason: ${inv.creditReason}`] : [])];
  } else if (inv.creditNotes.length) {
    const nums = inv.creditNotes.map((c) => c.invoiceNumber).join(", ");
    banner = credited >= Number(inv.total) ? ["Cancelled", `Fully credited via credit note ${nums}`] : ["Partially credited", `Credited ${money(credited)} via credit note(s) ${nums}`];
  }
  const totals: PdfDoc["totals"] = [{ label: "Subtotal", value: money(inv.subTotal) }];
  if (!inv.discountPerItem && Number(inv.discountVal) !== 0) totals.push({ label: inv.discountType === "PERCENTAGE" ? `Discount (${inv.discount}%)` : "Discount", value: `-${money(Math.abs(Number(inv.discountVal)))}` });
  if (inv.taxIncluded) totals.push({ label: "Net (tax included in prices)", value: money(Number(inv.total) - Number(inv.tax)) });
  for (const t of summary) totals.push({ label: `${t.name}${t.percent !== null && t.calculationType === "PERCENTAGE" ? ` (${t.percent}%)` : ""}${inv.taxIncluded ? " incl." : ""}`, value: money(t.amount) });
  totals.push({ label: "Total", value: money(inv.total), strong: true, boxed: true });
  if (!isCredit) {
    if (credited > 0) totals.push({ label: "Amount credited", value: money(credited) });
    if (paid > 0) totals.push({ label: "Amount paid", value: money(paid) });
    if (credited > 0 || paid > 0) totals.push({ label: "Amount due", value: money(inv.dueAmount), strong: true });
  }
  return {
    variant: (inv.templateName.slice(-1) as PdfDoc["variant"]) || "1",
    title: isCredit ? "Credit Note" : "Invoice",
    logo,
    companyName: pdfText(company.name),
    companyBlock: htmlToBlocks(fillPlaceholders(settings.invoice_company_address_format, values)),
    billBlock: htmlToBlocks(fillPlaceholders(settings.invoice_billing_address_format, values)),
    shipBlock: inv.customer.shippingStreet1 || inv.customer.shippingName ? htmlToBlocks(fillPlaceholders(settings.invoice_shipping_address_format, values)) : [],
    details: [
      { label: isCredit ? "Credit note number" : "Invoice number", value: inv.invoiceNumber },
      { label: isCredit ? "Credit note date" : "Invoice date", value: `${df(inv.invoiceDate)}${inv.invoiceTime && settings.invoice_use_time === "YES" ? ` ${inv.invoiceTime}` : ""}` },
      ...(inv.dueDate ? [{ label: "Due date", value: df(inv.dueDate) }] : []),
      ...(inv.referenceNumber && !isCredit ? [{ label: "Reference", value: inv.referenceNumber }] : []),
      ...docFields.filter((f) => answers[f.id]).map((f) => ({ label: f.label, value: pdfText(displayAnswer(f, answers[f.id])) })),
    ].map((r) => ({ label: pdfText(r.label), value: pdfText(r.value) })),
    banner,
    extraColumns: cols.extraColumns,
    showDiscount: inv.discountPerItem,
    showTax: inv.taxPerItem,
    lines: inv.lines.map((l) => ({
      name: pdfText(l.name),
      description: l.description ? pdfText(l.description) : null,
      quantity: `${qtyText(l.quantity)}${l.unitName ? ` ${l.unitName}` : ""}`,
      price: money(l.price),
      discount: inv.discountPerItem ? (l.discountType === "PERCENTAGE" ? `${l.discount}%` : money(l.discountVal)) : null,
      tax: inv.taxPerItem ? money(l.tax) : null,
      amount: money(l.total),
      extra: cols.extraFor(l),
    })),
    totals,
    notes: htmlToBlocks(fillPlaceholders(inv.notes ?? "", values)),
    portal: await invoicePortal(company, inv.customer),
    footer: `${pdfText(company.name)} · ${inv.invoiceNumber}`,
  };
}

export async function estimatePdfData(companyId: number, estimateId: number): Promise<PdfDoc | null> {
  const est = await db.estimate.findFirst({
    where: { id: estimateId, companyId },
    include: { customer: true, lines: { include: { taxes: true }, orderBy: { position: "asc" } }, taxes: { where: { lineItemId: null }, orderBy: { position: "asc" } } },
  });
  if (!est) return null;
  const { company, settings, logo } = await companyAssets(companyId);
  const money = fmt(settings, est.currency);
  const df = (d: Date | null) => (d ? formatDate(isoDate(d), settings.date_format) : "");
  const values = await placeholderValues(
    company,
    est.customer,
    { ESTIMATE_NUMBER: est.estimateNumber, ESTIMATE_DATE: df(est.estimateDate), ESTIMATE_EXPIRY_DATE: df(est.expiryDate), ESTIMATE_REF_NUMBER: est.referenceNumber ?? "" },
    "Estimate",
    est.id,
  );
  const docFields = (await getCustomFields(companyId, "Estimate")).filter((f) => f.placement === "document");
  const cols = await lineColumns(companyId, est.lines);
  const answers = await loadCustomFieldAnswers("Estimate", est.id);
  const summary = taxSummary({ lines: est.lines.map((l) => ({ taxes: l.taxes.map((t) => ({ ...t, amount: Number(t.amount), fixedAmount: null, baseAmount: 0 })) })), taxes: est.taxes.map((t) => ({ ...t, amount: Number(t.amount), fixedAmount: null, baseAmount: 0 })) }, est.taxPerItem);
  const totals: PdfDoc["totals"] = [{ label: "Subtotal", value: money(est.subTotal) }];
  if (!est.discountPerItem && Number(est.discountVal) !== 0) totals.push({ label: est.discountType === "PERCENTAGE" ? `Discount (${est.discount}%)` : "Discount", value: `-${money(est.discountVal)}` });
  for (const t of summary) totals.push({ label: `${t.name}${t.percent !== null && t.calculationType === "PERCENTAGE" ? ` (${t.percent}%)` : ""}${est.taxIncluded ? " incl." : ""}`, value: money(t.amount) });
  totals.push({ label: "Total", value: money(est.total), strong: true, boxed: true });
  return {
    variant: (est.templateName.slice(-1) as PdfDoc["variant"]) || "1",
    title: "Estimate",
    logo,
    companyName: pdfText(company.name),
    companyBlock: htmlToBlocks(fillPlaceholders(settings.estimate_company_address_format, values)),
    billBlock: htmlToBlocks(fillPlaceholders(settings.estimate_billing_address_format, values)),
    shipBlock: est.customer.shippingStreet1 || est.customer.shippingName ? htmlToBlocks(fillPlaceholders(settings.estimate_shipping_address_format, values)) : [],
    details: [
      { label: "Estimate number", value: est.estimateNumber },
      { label: "Estimate date", value: df(est.estimateDate) },
      ...(est.expiryDate ? [{ label: "Expiry date", value: df(est.expiryDate) }] : []),
      ...(est.referenceNumber ? [{ label: "Reference", value: est.referenceNumber }] : []),
      ...docFields.filter((f) => answers[f.id]).map((f) => ({ label: f.label, value: displayAnswer(f, answers[f.id]) })),
    ].map((r) => ({ label: pdfText(r.label), value: pdfText(r.value) })),
    banner: null,
    extraColumns: cols.extraColumns,
    showDiscount: est.discountPerItem,
    showTax: est.taxPerItem,
    lines: est.lines.map((l) => ({
      name: pdfText(l.name),
      description: l.description ? pdfText(l.description) : null,
      quantity: `${qtyText(l.quantity)}${l.unitName ? ` ${l.unitName}` : ""}`,
      price: money(l.price),
      discount: est.discountPerItem ? (l.discountType === "PERCENTAGE" ? `${l.discount}%` : money(l.discountVal)) : null,
      tax: est.taxPerItem ? money(l.tax) : null,
      amount: money(l.total),
      extra: cols.extraFor(l),
    })),
    totals,
    notes: htmlToBlocks(fillPlaceholders(est.notes ?? "", values)),
    portal: null,
    footer: `${pdfText(company.name)} · ${est.estimateNumber}`,
  };
}

export async function paymentPdfData(companyId: number, paymentId: number): Promise<SimplePdfData | null> {
  const p = await db.payment.findFirst({ where: { id: paymentId, companyId }, include: { customer: true, paymentMethod: true, allocations: { include: { invoice: true } } } });
  if (!p) return null;
  const { company, settings, logo } = await companyAssets(companyId);
  const money = fmt(settings, p.currency);
  const df = (d: Date) => formatDate(isoDate(d), settings.date_format);
  const values = await placeholderValues(
    company,
    p.customer,
    { PAYMENT_NUMBER: p.paymentNumber, PAYMENT_DATE: df(p.paymentDate), PAYMENT_MODE: p.paymentMethod?.name ?? "", PAYMENT_AMOUNT: money(p.amount) },
    "Payment",
    p.id,
  );
  const allocated = p.allocations.reduce((s, a) => s + Number(a.amount), 0);
  return {
    logo,
    companyName: pdfText(company.name),
    companyBlock: htmlToBlocks(fillPlaceholders(settings.payment_company_address_format, values)),
    title: "PAYMENT RECEIPT",
    meta: [
      { label: "Payment date", value: df(p.paymentDate) },
      { label: "Payment number", value: p.paymentNumber },
      { label: "Payment mode", value: p.paymentMethod?.name ?? "—" },
    ].map((m) => ({ label: m.label, value: pdfText(m.value) })),
    party: { heading: "RECEIVED FROM", blocks: htmlToBlocks(fillPlaceholders(settings.payment_from_customer_address_format, values)) },
    highlight: { label: "Amount received", value: money(p.amount) },
    sections: [
      ...(p.allocations.length
        ? [{ heading: "Applied to", table: { columns: [{ label: "Invoice number", flex: 2 }, { label: "Amount applied", align: "right" as const }], rows: p.allocations.map((a) => [a.invoice.invoiceNumber, money(a.amount)]) } }]
        : []),
      ...(Number(p.amount) > allocated ? [{ summary: [{ label: "Unapplied credit", value: money(Number(p.amount) - allocated) }] }] : []),
      ...(p.notes ? [{ heading: "Notes", blocks: htmlToBlocks(fillPlaceholders(p.notes, values)) }] : []),
    ],
    footer: `${pdfText(company.name)} · ${p.paymentNumber}`,
  };
}

export async function renderDocumentPdf(d: PdfDoc): Promise<Buffer> {
  return renderToBuffer(<DocumentPdf d={d} />);
}

export async function renderSimplePdf(d: SimplePdfData): Promise<Buffer> {
  return renderToBuffer(<SimplePdf d={d} />);
}

export async function pdfFor(kind: "invoice" | "estimate" | "payment", companyId: number, id: number): Promise<{ buffer: Buffer; filename: string } | null> {
  if (kind === "payment") {
    const d = await paymentPdfData(companyId, id);
    if (!d) return null;
    const p = await db.payment.findUnique({ where: { id }, select: { paymentNumber: true } });
    return { buffer: await renderSimplePdf(d), filename: `${p!.paymentNumber}.pdf` };
  }
  const d = kind === "invoice" ? await invoicePdfData(companyId, id) : await estimatePdfData(companyId, id);
  if (!d) return null;
  return { buffer: await renderDocumentPdf(d), filename: `${d.details[0].value}.pdf` };
}

export function pdfResponse(file: { buffer: Buffer; filename: string }, download: boolean): Response {
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
