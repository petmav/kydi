import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { htmlToText, sendMail, type MailMessage } from "@/lib/mail";
import { decryptJson } from "@/lib/secrets";
import { signV4 } from "@/lib/aws-sigv4";
import { formatFrom, isMailDriver, type MailDriver } from "@/lib/mail-config";
import { BlockedDestinationError, resolvePublicAddresses } from "@/lib/safe-fetch";

/**
 * Outgoing mail resolution (spec §5.12): company custom configuration (when switched on) → platform
 * configuration (Administration › Mail) → SMTP environment variables → stdout log.
 */

export type ResolvedMail = {
  source: "company" | "platform" | "environment";
  driver: MailDriver;
  from: string;
  options: Record<string, string>;
  secrets: Record<string, string>;
};

type Row = { enabled: boolean; driver: string; fromAddress: string | null; fromName: string | null; options: unknown; secrets: string | null };

function fromRow(row: Row, source: ResolvedMail["source"]): ResolvedMail | null {
  if (!row.enabled || !isMailDriver(row.driver)) return null;
  return {
    source,
    driver: row.driver,
    from: formatFrom(row.fromAddress, row.fromName, env.smtp.from),
    options: (row.options && typeof row.options === "object" ? row.options : {}) as Record<string, string>,
    secrets: decryptJson(row.secrets),
  };
}

/** Returns null when nothing beyond the environment/log fallback is configured. */
export async function resolveMailConfig(companyId: number | null): Promise<ResolvedMail | null> {
  if (companyId) {
    const own = await db.mailConfig.findUnique({ where: { companyId } });
    const r = own ? fromRow(own, "company") : null;
    if (r) return r;
  }
  const platform = await db.mailConfig.findFirst({ where: { companyId: null } });
  return platform ? fromRow(platform, "platform") : null;
}

const list = (v: string | string[] | undefined) => (v === undefined ? [] : [v].flat().filter(Boolean));

async function rawMime(message: MailMessage, from: string): Promise<Buffer> {
  const composer = new MailComposer({
    from,
    to: message.to,
    cc: message.cc,
    replyTo: message.replyTo,
    subject: message.subject,
    html: message.html,
    text: message.text ?? htmlToText(message.html),
    attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
  });
  return composer.compile().build();
}

async function check(res: Response, provider: string): Promise<void> {
  if (res.ok) return;
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 300).replace(/\s+/g, " ");
  } catch {
    // ignore
  }
  throw new Error(`${provider} rejected the message (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
}

/** Sends one message with a resolved configuration. Errors carry provider messages, never credentials. */
export async function deliverWith(cfg: ResolvedMail, message: MailMessage): Promise<{ delivered: true; transport: MailDriver }> {
  const from = message.from ?? cfg.from;
  const text = message.text ?? htmlToText(message.html);
  const o = cfg.options;
  const s = cfg.secrets;
  const timeout = AbortSignal.timeout(20000);
  switch (cfg.driver) {
    case "smtp": {
      const enc = o.encryption ?? "starttls";
      // Tenant-supplied hosts: resolve once, refuse non-public addresses and connect to the checked IP while
      // TLS still verifies the certificate against the host name (no DNS rebinding window).
      let host = o.host;
      let tls: { servername: string } | undefined;
      if (cfg.source === "company") {
        const [addr] = await resolvePublicAddresses(o.host ?? "");
        host = addr.address;
        tls = { servername: o.host };
      }
      const transport = nodemailer.createTransport({
        host,
        ...(tls ? { tls } : {}),
        port: Number(o.port || 587),
        secure: enc === "ssl" || enc === "tls",
        requireTLS: enc === "starttls",
        ignoreTLS: enc === "none",
        auth: o.username ? { user: o.username, pass: s.password ?? "" } : undefined,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
      });
      await transport.sendMail({ from, to: message.to, cc: message.cc, bcc: message.bcc, replyTo: message.replyTo, subject: message.subject, html: message.html, text, attachments: message.attachments });
      return { delivered: true, transport: "smtp" };
    }
    case "sendmail":
    case "mail": {
      if (cfg.source === "company") throw new BlockedDestinationError("The local sendmail transport is only available in the platform mail configuration.");
      const transport = nodemailer.createTransport({ sendmail: true, newline: "unix" });
      await transport.sendMail({ from, to: message.to, cc: message.cc, bcc: message.bcc, replyTo: message.replyTo, subject: message.subject, html: message.html, text, attachments: message.attachments });
      return { delivered: true, transport: cfg.driver };
    }
    case "mailgun": {
      const mime = await rawMime(message, from);
      const form = new FormData();
      form.append("to", [...list(message.to), ...list(message.cc), ...list(message.bcc)].join(","));
      form.append("message", new Blob([new Uint8Array(mime)], { type: "message/rfc822" }), "message.mime");
      const host = o.endpoint === "api.eu.mailgun.net" ? "api.eu.mailgun.net" : "api.mailgun.net";
      if (!/^[a-zA-Z0-9.-]+$/.test(o.domain ?? "")) throw new BlockedDestinationError("The Mailgun domain is not valid.");
      const res = await fetch(`https://${host}/v3/${encodeURIComponent(o.domain ?? "")}/messages.mime`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`api:${s.secret ?? ""}`).toString("base64")}` },
        body: form,
        signal: timeout,
      });
      await check(res, "Mailgun");
      return { delivered: true, transport: "mailgun" };
    }
    case "postmark": {
      const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": s.token ?? "" },
        body: JSON.stringify({
          From: from,
          To: list(message.to).join(","),
          Cc: list(message.cc).join(",") || undefined,
          Bcc: list(message.bcc).join(",") || undefined,
          ReplyTo: message.replyTo,
          Subject: message.subject,
          HtmlBody: message.html,
          TextBody: text,
          Attachments: message.attachments?.map((a) => ({ Name: a.filename, Content: a.content.toString("base64"), ContentType: a.contentType ?? "application/octet-stream" })),
        }),
        signal: timeout,
      });
      await check(res, "Postmark");
      return { delivered: true, transport: "postmark" };
    }
    case "ses": {
      const region = o.region ?? "us-east-1";
      if (!/^[a-z]{2}(-[a-z]+)+-[0-9]$/.test(region)) throw new BlockedDestinationError("The Amazon SES region is not valid.");
      const mime = await rawMime(message, from);
      const body = JSON.stringify({
        FromEmailAddress: from,
        Destination: { ToAddresses: list(message.to), CcAddresses: list(message.cc), BccAddresses: list(message.bcc) },
        Content: { Raw: { Data: mime.toString("base64") } },
      });
      const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
      const signed = signV4({ method: "POST", url, region, service: "ses", headers: { "content-type": "application/json" }, body, accessKeyId: o.key ?? "", secretAccessKey: s.secret ?? "" });
      const res = await fetch(url, { method: "POST", headers: signed.headers, body, signal: timeout });
      await check(res, "Amazon SES");
      return { delivered: true, transport: "ses" };
    }
  }
}

/** Company mail (documents, invitations, notifications, test mail). */
export async function deliver(companyId: number | null, message: MailMessage): Promise<{ delivered: boolean; transport: string }> {
  const cfg = await resolveMailConfig(companyId);
  if (!cfg) return sendMail(message);
  return deliverWith(cfg, message);
}

/** Sender address used for email logs and the send dialog. */
export async function senderFor(companyId: number | null): Promise<string> {
  const cfg = await resolveMailConfig(companyId);
  return cfg?.from ?? env.smtp.from;
}
