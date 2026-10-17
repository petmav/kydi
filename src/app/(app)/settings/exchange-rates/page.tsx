import type { Metadata } from "next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { Forbidden } from "@/components/forbidden";
import { ModalForm } from "@/components/modal";
import { ActionButton, ConfirmButton } from "@/components/confirm";
import { ProviderFields } from "@/components/settings/provider-fields";
import { getCompanyContext } from "@/lib/auth/context";
import { currencyOptions } from "@/lib/intl-data";
import { RATE_DRIVER_LABELS } from "@/lib/exchange-rates";
import { listProviders } from "@/server/exchange-rates";
import { deleteProviderAction, saveProviderAction, testProviderAction, toggleProviderAction } from "./actions";

export const metadata: Metadata = { title: "Exchange rate provider" };

/** Spec §5.12 Exchange rate provider: list (driver, masked key, currencies, active) and add/edit modal. */
export default async function ExchangeRatesPage() {
  const ctx = await getCompanyContext();
  if (!ctx.can("view-exchange-rate-provider")) return <Forbidden />;
  const providers = await listProviders(ctx.companyId);
  const currencies = currencyOptions().filter((c) => c.value !== ctx.settings.currency);
  const inUse = (selfId: number | null) => providers.filter((p) => p.active && p.id !== selfId).flatMap((p) => p.currencies);
  return (
    <Card>
      <CardHeader
        title="Exchange rate provider"
        description={`Live rates for foreign-currency documents, quoted as 1 foreign unit in ${ctx.settings.currency}. Without a provider, the last rate used is suggested.`}
        actions={
          ctx.can("create-exchange-rate-provider") ? (
            <ModalForm
              trigger={
                <>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add provider
                </>
              }
              title="Add exchange rate provider"
              action={saveProviderAction.bind(null, null)}
              size="sm"
            >
              <ProviderFields currencies={currencies} inUse={inUse(null)} />
            </ModalForm>
          ) : null
        }
      />
      {providers.length === 0 ? (
        <EmptyState title="No providers yet" description="Add a provider to fetch live exchange rates when you create foreign-currency documents." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Provider</Th>
              <Th>API key</Th>
              <Th>Currencies</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {providers.map((p) => (
              <tr key={p.id}>
                <Td className="font-medium">{RATE_DRIVER_LABELS[p.driver] ?? p.driver}</Td>
                <Td className="font-mono text-xs text-muted">{p.hasKey ? "••••••••" : "Not set"}</Td>
                <Td className="max-w-xs truncate font-mono text-xs">{p.currencies.join(", ")}</Td>
                <Td>{p.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <ActionButton action={testProviderAction.bind(null, p.id)} size="sm" variant="ghost">
                      Check rate
                    </ActionButton>
                    {ctx.can("edit-exchange-rate-provider") ? (
                      <>
                        <ActionButton action={toggleProviderAction.bind(null, p.id, !p.active)} size="sm" variant="ghost">
                          {p.active ? "Deactivate" : "Activate"}
                        </ActionButton>
                        <ModalForm trigger={<Pencil className="h-4 w-4" aria-label="Edit provider" />} title="Edit exchange rate provider" action={saveProviderAction.bind(null, p.id)} variant="ghost" size="sm">
                          <ProviderFields provider={p} currencies={currencies} inUse={inUse(p.id)} />
                        </ModalForm>
                      </>
                    ) : null}
                    {ctx.can("delete-exchange-rate-provider") ? (
                      <ConfirmButton action={deleteProviderAction.bind(null, p.id)} title="Delete this provider?" description="Active providers must be deactivated first." confirmLabel="Delete" variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4 text-red-600" aria-label="Delete provider" />
                      </ConfirmButton>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <CardBody className="border-t border-line text-xs text-muted">
        Lookup order on documents, payments and expenses: live quote from the active provider that lists the currency, then the last rate used for that currency, then
        manual entry. Quotes are cached for 10 minutes.
      </CardBody>
    </Card>
  );
}
