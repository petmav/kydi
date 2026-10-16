import { db } from "@/lib/db";

/** Saves the user's default PDF template preference. */
export async function saveDefaultTemplate(userId: number, kind: "invoice" | "estimate", template: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  const settings = { ...((user?.settings as Record<string, string>) ?? {}), [`default_${kind}_template`]: template };
  await db.user.update({ where: { id: userId }, data: { settings } });
}
