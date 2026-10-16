"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, guard, parseForm, success, type ActionState } from "@/lib/action";
import { requireAbility } from "@/lib/auth/context";
import { renderDocumentEmail, sendDocumentEmail, type DocKind } from "@/server/email";

const emails = (v: string | undefined) => !v || v.split(",").every((e) => z.string().email().safeParse(e.trim()).success);
const sendSchema = z.object({
  to: z.string().trim().email("Enter a valid recipient email."),
  cc: z.string().trim().optional().refine(emails, "Separate multiple emails with commas."),
  bcc: z.string().trim().optional().refine(emails, "Separate multiple emails with commas."),
  subject: z.string().trim().min(1, "Enter a subject.").max(255),
  body: z.string().max(65000),
});

const ABILITY = { invoice: "send-invoice", estimate: "send-estimate", payment: "send-payment" } as const;

export async function sendDocumentAction(kind: DocKind, id: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireAbility(ABILITY[kind]);
    const parsed = parseForm(sendSchema, formData);
    if (!parsed.success) return parsed.state;
    const r = await sendDocumentEmail(ctx.companyId, kind, id, parsed.data);
    revalidatePath(`/${kind}s/${id}`);
    if (!r.ok) return failure(r.error);
    return success(r.transport === "log" ? "Email recorded. SMTP is not configured, so it was written to the server log." : "Email sent.");
  });
}

export async function previewEmailAction(kind: DocKind, id: number, fields: { to: string; subject: string; body: string }): Promise<{ subject: string; html: string } | null> {
  const ctx = await requireAbility(ABILITY[kind]);
  const r = await renderDocumentEmail(ctx.companyId, kind, id, { ...fields, cc: null, bcc: null });
  return r ? { subject: r.subject, html: r.html } : null;
}
