import { redirect } from "next/navigation";
import { getCompanyContext } from "@/lib/auth/context";
import { settingsNavItems } from "./nav";

export default async function SettingsIndex() {
  const ctx = await getCompanyContext();
  const first = settingsNavItems(ctx).find((i) => i.href.startsWith("/settings/"));
  redirect(first?.href ?? "/profile");
}
