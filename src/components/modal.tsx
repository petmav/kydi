"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Form, SubmitButton, type FormAction } from "@/components/form";
import type { ActionState } from "@/lib/action";

/** A trigger button that opens a modal dialog containing a server-action form. */
export function ModalForm({
  trigger,
  title,
  description,
  action,
  children,
  submitLabel = "Save",
  variant = "primary",
  size = "md",
  wide = false,
  triggerClassName,
  onSuccess,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  action: FormAction;
  children: ReactNode;
  submitLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  wide?: boolean;
  triggerClassName?: string;
  onSuccess?: (state: NonNullable<ActionState>) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const router = useRouter();
  const titleId = useId();

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={triggerClassName}
        aria-haspopup="dialog"
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
          ref.current?.showModal();
        }}
      >
        {trigger}
      </Button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        aria-labelledby={titleId}
        className={`m-auto w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-md border border-line bg-white p-0 shadow-xl backdrop:bg-slate-900/40`}
      >
        {open ? (
          <Form
            key={key}
            action={action}
            className="flex max-h-[85vh] flex-col"
            onResult={(s) => {
              if (s.ok) {
                ref.current?.close();
                router.refresh();
                onSuccess?.(s);
              }
            }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold text-ink">
                  {title}
                </h2>
                {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => ref.current?.close()}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-ring"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto px-6 py-5">{children}</div>
            <div className="flex justify-end gap-2 border-t border-line bg-slate-50 px-6 py-3">
              <Button variant="secondary" onClick={() => ref.current?.close()}>
                Cancel
              </Button>
              <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
            </div>
          </Form>
        ) : null}
      </dialog>
    </>
  );
}
