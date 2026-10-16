import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { RowActions } from "@/components/settings/forms";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { revokeApiTokenAction } from "../misc-actions";
import { CreateTokenButton } from "./create-token";

export const metadata: Metadata = { title: "API tokens" };

export default async function ApiTokensPage() {
  const ctx = await getCompanyContext();
  const tokens = await db.apiToken.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: "desc" } });
  const tz = ctx.settings.time_zone;
  return (
    <Card>
      <CardHeader
        title="API tokens"
        description="Personal bearer tokens for the REST API (/api/v1). Requests act as you, with your role in the company selected by the “company” header."
        actions={<CreateTokenButton />}
      />
      {tokens.length === 0 ? (
        <EmptyState icon={<KeyRound className="h-6 w-6" aria-hidden="true" />} title="No API tokens" description="Create a token to integrate Halyard with other tools." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Token</Th>
              <Th>Last used</Th>
              <Th>Expires</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tokens.map((t) => (
              <tr key={t.id}>
                <Td className="font-medium">{t.name}</Td>
                <Td className="font-mono text-xs text-muted">hyd_{t.prefix}_••••</Td>
                <Td className="text-muted">{t.lastUsedAt ? formatDateTime(t.lastUsedAt, tz) : "Never"}</Td>
                <Td className="text-muted">{t.expiresAt ? formatDateTime(t.expiresAt, tz) : "Never"}</Td>
                <Td>
                  <RowActions deleteAction={revokeApiTokenAction.bind(null, t.id)} deleteTitle={`Revoke ${t.name}?`} deleteDescription="Integrations using this token stop working immediately." />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <CardBody className="border-t border-line text-sm text-muted">
        Example: <code className="text-xs">curl -H &quot;Authorization: Bearer hyd_…&quot; -H &quot;company: {ctx.companyId}&quot; /api/v1/customers</code>
      </CardBody>
    </Card>
  );
}
