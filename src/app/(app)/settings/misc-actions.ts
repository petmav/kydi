"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure, formToObject, guard, parseForm, success, zEmail, type ActionState } from "@/lib/action";
import { saveMailConfig } from "@/server/mail-settings";
import { requireOwner, requireUser } from "@/lib/auth/context";
import { randomToken, sha256 } from "@/lib/auth/tokens";
import { sendCompanyMail } from "@/server/mailer";

const testMailSchema = z.object({
  to: zEmail,
  subject: z.string().trim().min(1, "Enter a subject.").max(255),
  message: z.string().trim().min(1, "Enter a message.").max(5000),
});

export async function sendTestMailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const parsed = parseForm(testMailSchema, formData);
    if (!parsed.success) return parsed.state;
    try {
      const res = await sendCompanyMail(ctx.companyId, {
        to: parsed.data.to,
        subject: parsed.data.subject,
        html: `<p>${parsed.data.message.replace(/[<>&]/g, "").replace(/\n/g, "<br>")}</p><p>— ${ctx.company.name} via Kydi</p>`,
      });
      return success(res.delivered ? `Test email sent via ${res.transport}.` : "No mail server is configured: the email was written to the server log.");
    } catch (err) {
      return failure(`Sending failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  });
}

const tokenSchema = z.object({
  name: z.string().trim().min(2, "Enter a token name.").max(80),
  expiresInDays: z.coerce.number().int().min(0).max(3650),
});

export async function createApiTokenAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const parsed = parseForm(tokenSchema, formData);
    if (!parsed.success) return parsed.state;
    const prefix = randomToken(6).replace(/[^A-Za-z0-9]/g, "x").slice(0, 8);
    const secret = randomToken(32);
    const token = `kyd_${prefix}_${secret}`;
    await db.apiToken.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        prefix,
        tokenHash: sha256(token),
        expiresAt: parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 86400000) : null,
      },
    });
    revalidatePath("/settings/api-tokens");
    return success("API token created. Copy it now — it will not be shown again.", { token });
  });
}

export async function revokeApiTokenAction(id: number): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    await db.apiToken.deleteMany({ where: { id, userId: user.id } });
    revalidatePath("/settings/api-tokens");
    return success("Token revoked.");
  });
}

/** Spec §5.12 Mail configuration (owner only). Secrets stay server-side. */
export async function saveMailConfigAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOwner();
    const r = await saveMailConfig(ctx.companyId, formToObject(formData));
    if (!r.ok) return failure(r.error, r.fieldErrors);
    revalidatePath("/settings/mail");
    return success("Mail configuration saved.");
  });
}
