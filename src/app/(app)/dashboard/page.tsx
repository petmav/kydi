import type { Metadata } from "next";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { getCompanyContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await getCompanyContext();
  return (
    <>
      <PageHeader title="Dashboard" description={`Overview for ${ctx.company.name}`} />
      <Card>
        <CardBody>
          <p className="text-sm text-muted">Welcome, {ctx.user.name}. Your dashboard will show revenue, outstanding invoices and recent activity.</p>
        </CardBody>
      </Card>
    </>
  );
}
