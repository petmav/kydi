import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

export type MailAttachment = { filename: string; content: Buffer; contentType?: string };
export type MailMessage = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
};

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Sends an email via SMTP, or logs it to stdout when SMTP is not configured. */
export async function sendMail(message: MailMessage): Promise<{ delivered: boolean; transport: "smtp" | "log" }> {
  const t = getTransporter();
  const payload = {
    from: message.from ?? env.smtp.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    replyTo: message.replyTo,
    subject: message.subject,
    html: message.html,
    text: message.text ?? htmlToText(message.html),
    attachments: message.attachments,
  };
  if (!t) {
    console.log(
      [
        "[halyard:mail] SMTP not configured, logging email instead",
        `  to: ${[payload.to].flat().join(", ")}`,
        payload.cc ? `  cc: ${[payload.cc].flat().join(", ")}` : null,
        `  subject: ${payload.subject}`,
        payload.attachments?.length ? `  attachments: ${payload.attachments.map((a) => a.filename).join(", ")}` : null,
        "  ---",
        payload.text
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n"),
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return { delivered: false, transport: "log" };
  }
  await t.sendMail(payload);
  return { delivered: true, transport: "smtp" };
}
