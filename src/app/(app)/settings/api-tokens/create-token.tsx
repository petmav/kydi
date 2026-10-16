"use client";

import { useState } from "react";
import { Field, SelectField } from "@/components/form";
import { ModalForm } from "@/components/modal";
import { Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toast";
import { createApiTokenAction } from "../misc-actions";

export function CreateTokenButton() {
  const [token, setToken] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-3">
      <ModalForm
        trigger="Create token"
        title="Create API token"
        action={createApiTokenAction}
        size="sm"
        submitLabel="Create"
        onSuccess={(s) => setToken(typeof s.data?.token === "string" ? s.data.token : null)}
      >
        <Field name="name" label="Name" required placeholder="e.g. Accounting sync" autoFocus />
        <SelectField
          name="expiresInDays"
          label="Expires"
          options={[
            { value: "30", label: "In 30 days" },
            { value: "90", label: "In 90 days" },
            { value: "365", label: "In 1 year" },
            { value: "0", label: "Never" },
          ]}
          defaultValue="90"
        />
      </ModalForm>
      {token ? (
        <div className="w-full max-w-xl">
          <Alert tone="success" title="Copy your new token now">
            <code className="block break-all rounded bg-white/70 p-2 text-xs">{token}</code>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(token);
                  toast("Token copied to clipboard.");
                }}
              >
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setToken(null)}>
                Done
              </Button>
            </div>
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
