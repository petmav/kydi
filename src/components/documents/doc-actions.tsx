"use client";

import { Link2 } from "lucide-react";
import { Field, TextareaField, type FormAction } from "@/components/form";
import { ModalForm } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toast";

export function CopyLinkButton({ url, label = "Copy PDF URL" }: { url: string; label?: string }) {
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        toast("Link copied to clipboard.");
      }}
    >
      <Link2 className="h-4 w-4" aria-hidden="true" /> {label}
    </Button>
  );
}

export type CreditLineRow = { id: number; name: string; price: string; quantity: number; credited: number; remaining: number };

export function CreditNoteButton({ action, lines }: { action: FormAction; lines: CreditLineRow[] }) {
  return (
    <ModalForm trigger="Create credit note" title="Create credit note" description="Tax and discount are pro-rated proportionally to the credited quantities." action={action} variant="secondary" wide submitLabel="Create credit note">
      <TextareaField name="reason" label="Reason" maxLength={1000} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-subtle text-xs uppercase text-muted">
            <tr>
              <th scope="col" className="px-2 py-2 text-left">Item</th>
              <th scope="col" className="px-2 py-2 text-right">Price</th>
              <th scope="col" className="px-2 py-2 text-right">Invoiced</th>
              <th scope="col" className="px-2 py-2 text-right">Credited</th>
              <th scope="col" className="px-2 py-2 text-right">Remaining</th>
              <th scope="col" className="w-28 px-2 py-2 text-right">To credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-2 py-2">{l.name}</td>
                <td className="tabular px-2 py-2 text-right">{l.price}</td>
                <td className="tabular px-2 py-2 text-right">{l.quantity}</td>
                <td className="tabular px-2 py-2 text-right">{l.credited}</td>
                <td className="tabular px-2 py-2 text-right">{l.remaining}</td>
                <td className="px-2 py-2">
                  <Field
                    name={`qty_${l.id}`}
                    label={<span className="sr-only">Quantity to credit for {l.name}</span>}
                    type="number"
                    min="0"
                    step="0.01"
                    max={l.remaining}
                    defaultValue={l.remaining}
                    disabled={l.remaining <= 0}
                    inputClassName="tabular text-right"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalForm>
  );
}
