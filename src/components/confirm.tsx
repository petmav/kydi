"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/action";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Spinner } from "@/components/ui/primitives";
import { FLASH_CHECK_EVENT, toast } from "@/components/toast";

function handleResult(result: ActionState, after?: () => void) {
  if (result?.ok) {
    if (result.message) toast(result.message, "success");
    after?.();
  } else if (result?.error) {
    toast(result.error, "error");
  }
  window.dispatchEvent(new Event(FLASH_CHECK_EVENT));
}

/** Button that runs a server action immediately and toasts the result. */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  size = "md",
  className,
  redirectTo,
  title,
}: {
  action: () => Promise<ActionState>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  redirectTo?: string;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      title={title}
      onClick={() =>
        start(async () => {
          const result = await action();
          handleResult(result, () => {
            if (redirectTo) router.push(redirectTo);
            else router.refresh();
          });
        })
      }
    >
      {pending ? <Spinner /> : null}
      {children}
    </Button>
  );
}

/** Button that asks for confirmation in a modal dialog before running a server action. */
export function ConfirmButton({
  action,
  children,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "outline-danger",
  confirmVariant = "danger",
  size = "md",
  className,
  redirectTo,
}: {
  action: () => Promise<ActionState>;
  children: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  variant?: ButtonVariant;
  confirmVariant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  redirectTo?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
        aria-haspopup="dialog"
      >
        {children}
      </Button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        aria-labelledby="confirm-title"
        className="m-auto w-full max-w-md rounded-md border border-line bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        {open ? (
          <div className="p-6">
            <h2 id="confirm-title" className="text-lg font-semibold text-ink">
              {title}
            </h2>
            {description ? <div className="mt-2 text-sm text-muted">{description}</div> : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => ref.current?.close()} disabled={pending} autoFocus>
                Cancel
              </Button>
              <Button
                variant={confirmVariant}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await action();
                    handleResult(result, () => {
                      ref.current?.close();
                      if (redirectTo) router.push(redirectTo);
                      else router.refresh();
                    });
                  })
                }
              >
                {pending ? <Spinner /> : null}
                {confirmLabel}
              </Button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
