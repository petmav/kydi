import type { Metadata } from "next";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Modules · Administration" };

/** Spec §3.22 / §11: module registry screen only; marketplace installs are out of scope. */
export default async function ModulesPage() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") return null;
  return (
    <Card>
      <CardHeader title="Modules" description="Add-ons registered on this installation." />
      <EmptyState title="No modules are installed" description="The module marketplace is not available in this version." />
    </Card>
  );
}
