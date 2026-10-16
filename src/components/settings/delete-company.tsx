"use client";

import { ModalForm } from "@/components/modal";
import { Field } from "@/components/form";
import { deleteCompanyAction } from "@/app/(app)/settings/actions";

export function DeleteCompanyForm({ companyName }: { companyName: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">Member accounts survive; only their membership in this company is removed.</p>
      <ModalForm
        trigger="Delete company"
        title={`Delete ${companyName}?`}
        description="This permanently deletes every record of this company. This cannot be undone."
        action={deleteCompanyAction}
        variant="outline-danger"
        submitLabel="Delete company"
      >
        <Field name="confirm" label={`Type "${companyName}" to confirm`} required autoComplete="off" />
      </ModalForm>
    </div>
  );
}
