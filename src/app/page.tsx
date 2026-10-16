import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userCount = await db.user.count();
  if (userCount === 0) redirect("/install");
  const user = await getSessionUser();
  redirect(user ? "/dashboard" : "/login");
}
