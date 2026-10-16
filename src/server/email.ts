import { db } from "@/lib/db";
import { getCompanySettings } from "@/lib/settings";
import { countryName } from "@/lib/intl-data";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDate } from "@/lib/dates";
import { companyValues, customerValues, fillPlaceholders } from "@/lib/placeholders";
import { customFieldPlaceholders } from "@/lib/custom-fields";
import { randomToken } from "@/lib/auth/tokens";
import { sendMail } from "@/lib/mail";
import { getBaseUrl } from "@/lib/url";
import { invoiceTransitions, estimateTransitions } from "@/domain/status";
import { pdfFor } from "./pdf";

export type DocKind = "invoice" | "estimate" | "payment";
export type EmailFields = { to: string; cc?: string | null; bcc?: string | null; subject: string; body: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Strips scripts/handlers from user-authored HTML before it goes into emails. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2");
}

async function loadDoc(companyId: number, kind: DocKind, id: number) {
  if (kind === "invoice") {
    const d = await db.invoice.findFirst({ where: { id, companyId }, include: { customer: true } });
    return d ? { customer: d.customer, number: d.invoiceNumber, type: d.type, values: (df: (x: Date | null) => string, money: (v: bigint) => string) => ({ INVOICE_NUMBER: d.invoiceNumber, INVOICE_DATE: df(d.invoiceDate), INVOICE_DUE_DATE: df(d.dueDate), INVOICE_REF_NUMBER: d.referenceNumber ?? "", INVOICE_TOTAL: money(d.total), INVOICE_DUE_AMOUNT: money(d.dueAmount) }), currency: d.currency, model: "Invoice" as const } : null;
  }
  if (kind === "estimate") {
    const d = await db.estimate.findFirst({ where: { id, companyId }, include: { customer: true } });
    return d ? { customer: d.customer, number: d.estimateNumber, type: "ESTIMATE", values: (df: (x: Date | null) => string, money: (v: bigint) => string) => ({ ESTIMATE_NUMBER: d.estimateNumber, ESTIMATE_DATE: df(d.estimateDate), ESTIMATE_EXPIRY_DATE: df(d.expiryDate), ESTIMATE_REF_NUMBER: d.referenceNumber ?? "", ESTIMATE_TOTAL: money(d.total) }), currency: d.currency, model: "Estimate" as const } : null;
  }
  const d = await db.payment.findFirst({ where: { id, companyId }, include: { customer: true, paymentMethod: true } });
  return d ? { customer: d.customer, number: d.paymentNumber, type: "PAYMENT", values: (df: (x: Date | null) => string, money: (v: bigint) => string) => ({ PAYMENT_NUMBER: d.paymentNumber, PAYMENT_DATE: df(d.paymentDate), PAYMENT_MODE: d.paymentMethod?.name ?? "", PAYMENT_AMOUNT: money(d.amount) }), currency: d.currency, model: "Payment" as const } : null;
}

async function placeholderMap(companyId: number, kind: DocKind, id: number) {
  const doc = await loadDoc(companyId, kind, id);
  if (!doc) return null;
  const company = (await db.company.findUnique({ where: { id: companyId } }))!;
  const settings = await getCompanySettings(companyId);
  const df = (d: Date | null) => (d ? formatDate(isoDate(d), settings.date_format) : "");
  const money = (v: bigint) => formatMoney(Number(v), doc.currency, settings.locale);
  const values: Record<string, string | null | undefined> = {
    ...companyValues(company, countryName),
    ...customerValues(doc.customer, countryName),
    CONTACT_TAX_ID: doc.customer.taxId ? `Tax ID: ${doc.customer.taxId}` : "",
    ...doc.values(df, money),
    ...(await customFieldPlaceholders(companyId, "Customer", doc.customer.id)),
    ...(await customFieldPlaceholders(companyId, doc.model, id)),
  };
  return { doc, company, settings, values };
}

/** Defaults for the send dialog (spec §4.11). */
export async function emailDefaults(companyId: number, kind: DocKind, id: number): Promise<EmailFields & { from: string } | null> {
  const m = await placeholderMap(companyId, kind, id);
  if (!m) return null;
  return {
    from: process.env.SMTP_FROM || "Kydi <no-reply@kydi.local>",
    to: m.doc.customer.email ?? "",
    cc: "",
    bcc: "",
    subject: m.settings[`${kind}_mail_subject`],
    body: m.settings[`${kind}_mail_body`],
  };
}

export function layout(opts: { companyName: string; logoUrl: string | null; body: string; buttonLabel?: string; link?: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e2e8f0">${opts.logoUrl ? `<img src="${opts.logoUrl}" alt="${esc(opts.companyName)}" style="max-height:40px">` : `<strong style="font-size:18px">${esc(opts.companyName)}</strong>`}</td></tr>
<tr><td style="padding:24px 28px;font-size:14px;line-height:1.6">${opts.body}
${opts.link && opts.buttonLabel ? `<p style="margin:24px 0"><a href="${opts.link}" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">${esc(opts.buttonLabel)}</a></p>` : ""}</td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">Sent with Kydi</td></tr>
</table></td></tr></table></body></html>`;
}

const BUTTON: Record<DocKind, string> = { invoice: "View Invoice", estimate: "View Estimate", payment: "View Payment" };

export async function renderDocumentEmail(companyId: number, kind: DocKind, id: number, fields: EmailFields, link = "#") {
  const m = await placeholderMap(companyId, kind, id);
  if (!m) return null;
  const base = await getBaseUrl();
  const subject = fillPlaceholders(fields.subject, m.values, false).replace(/[\r\n]+/g, " ").trim();
  const body = sanitizeHtml(fillPlaceholders(fields.body, m.values));
  const label = kind === "invoice" && m.doc.type === "CREDIT_NOTE" ? "View Credit Note" : BUTTON[kind];
  return { subject, html: layout({ companyName: m.company.name, logoUrl: m.company.logoPath ? `${base}/api/files/logo/${m.company.uniqueHash}` : null, body, buttonLabel: label, link }), m };
}

/** Sends a document email: log row + public link, optional PDF, status effects (spec §4.11). */
export async function sendDocumentEmail(companyId: number, kind: DocKind, id: number, fields: EmailFields): Promise<{ ok: true; transport: string } | { ok: false; error: string }> {
  const token = randomToken(32);
  const link = `${await getBaseUrl()}/customer/${kind}s/view/${token}`;
  const r = await renderDocumentEmail(companyId, kind, id, fields, link);
  if (!r) return { ok: false, error: "Document not found." };
  const attach = r.m.settings[`${kind}_email_attachment`] === "YES";
  const pdf = attach ? await pdfFor(kind, companyId, id) : null;
  await db.emailLog.create({
    data: { companyId, from: process.env.SMTP_FROM || "Kydi <no-reply@kydi.local>", to: fields.to, cc: fields.cc || null, bcc: fields.bcc || null, subject: r.subject, body: r.html, mailableType: kind, mailableId: id, token },
  });
  try {
    const res = await sendMail({
      to: fields.to,
      cc: fields.cc ? fields.cc.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      bcc: fields.bcc ? fields.bcc.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      subject: r.subject,
      html: r.html,
      attachments: pdf ? [{ filename: pdf.filename, content: pdf.buffer, contentType: "application/pdf" }] : undefined,
    });
    if (kind === "invoice") {
      const inv = await db.invoice.findUnique({ where: { id } });
      if (inv) await db.invoice.update({ where: { id }, data: { status: invoiceTransitions.afterEmail(inv.status), sent: true } });
    } else if (kind === "estimate") {
      const est = await db.estimate.findUnique({ where: { id } });
      if (est) await db.estimate.update({ where: { id }, data: { status: estimateTransitions.afterEmail(est.status) } });
    }
    return { ok: true, transport: res.transport };
  } catch (e) {
    console.error("[kydi] send failed", e);
    return { ok: false, error: `Email could not be sent: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}

/** Marks a document viewed (customer opened link / portal) and notifies when enabled (spec §4.5 / §4.7). */
export async function markViewed(kind: "invoice" | "estimate", id: number) {
  if (kind === "invoice") {
    const inv = await db.invoice.findUnique({ where: { id }, include: { customer: true } });
    if (!inv) return;
    const next = invoiceTransitions.afterView(inv.status);
    if (next !== inv.status || !inv.viewed) {
      await db.invoice.update({ where: { id }, data: { status: next, viewed: true } });
      if (!inv.viewed) await notifyViewed(inv.companyId, "invoice", inv.invoiceNumber, inv.customer.name, `/invoices/${id}`);
    }
  } else {
    const est = await db.estimate.findUnique({ where: { id }, include: { customer: true } });
    if (!est) return;
    const next = estimateTransitions.afterView(est.status);
    if (next !== est.status) {
      await db.estimate.update({ where: { id }, data: { status: next } });
      await notifyViewed(est.companyId, "estimate", est.estimateNumber, est.customer.name, `/estimates/${id}`);
    }
  }
}

async function notifyViewed(companyId: number, kind: "invoice" | "estimate", number: string, customer: string, path: string) {
  const s = await getCompanySettings(companyId);
  if (s[`notify_${kind}_viewed`] !== "YES" || !s.notification_email) return;
  const url = `${await getBaseUrl()}${path}`;
  await sendMail({
    to: s.notification_email,
    subject: `${customer} viewed ${kind} ${number}`,
    html: `<p>${esc(customer)} has viewed ${kind} <strong>${esc(number)}</strong>.</p><p><a href="${url}">Open in Kydi</a></p><p>— Kydi</p>`,
  }).catch((e) => console.error("[kydi] viewed notification failed", e));
}

/** Resolves an emailed link token (spec §7.7). */
export async function resolveEmailToken(kind: DocKind, token: string): Promise<{ status: "ok"; companyId: number; id: number } | { status: "expired" } | { status: "missing" }> {
  const log = await db.emailLog.findUnique({ where: { token } });
  if (!log || log.mailableType !== kind) return { status: "missing" };
  const s = await getCompanySettings(log.companyId);
  if (s.automatically_expire_public_links === "YES") {
    const days = Number(s.link_expiry_days) || 7;
    if (Date.now() > log.createdAt.getTime() + days * 86400000) return { status: "expired" };
  }
  return { status: "ok", companyId: log.companyId, id: log.mailableId };
}
