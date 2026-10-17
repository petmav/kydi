import type { MailMessage } from "@/lib/mail";
import { deliver } from "@/server/mail-transport";

/** Sends mail on behalf of a company: its own mail configuration when switched on, else the platform one. */
export async function sendCompanyMail(companyId: number, message: MailMessage) {
  return deliver(companyId, message);
}

/** Installation mail (password resets, staff notifications): platform configuration, then environment SMTP. */
export async function sendPlatformMail(message: MailMessage) {
  return deliver(null, message);
}
