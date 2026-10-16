import { sendMail, type MailMessage } from "@/lib/mail";

/** Sends mail on behalf of a company. Uses the installation transport (per-company drivers come later). */
export async function sendCompanyMail(companyId: number, message: MailMessage) {
  void companyId;
  return sendMail(message);
}
