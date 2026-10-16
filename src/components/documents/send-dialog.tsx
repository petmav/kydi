"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Field, Form, SubmitButton, type FormAction } from "@/components/form";
import { TemplateTextarea } from "@/components/settings/forms";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Spinner } from "@/components/ui/primitives";

export function SendDialog({
  label,
  title,
  action,
  preview,
  defaults,
  placeholders,
  autoOpen = false,
  variant = "primary",
}: {
  label: string;
  title: string;
  action: FormAction;
  preview: (fields: { to: string; subject: string; body: string }) => Promise<{ subject: string; html: string } | null>;
  defaults: { from: string; to: string; subject: string; body: string };
  placeholders: string[];
  autoOpen?: boolean;
  variant?: ButtonVariant;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [html, setHtml] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDialogElement>(null);
  const formWrap = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (open && ref.current && !ref.current.open) ref.current.showModal();
  }, [open]);

  const doPreview = () => {
    const form = formWrap.current?.querySelector("form");
    if (!form) return;
    const fd = new FormData(form);
    start(async () => {
      const r = await preview({ to: String(fd.get("to") ?? ""), subject: String(fd.get("subject") ?? ""), body: String(fd.get("body") ?? "") });
      setHtml(r?.html ?? "<p>Preview unavailable.</p>");
    });
  };

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {label}
      </Button>
      {open
        ? createPortal(
            <dialog
              ref={ref}
              onClose={() => {
                setOpen(false);
                setHtml(null);
              }}
              aria-label={title}
              className="m-auto w-full max-w-2xl rounded-md border border-line bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
            >
              <div ref={formWrap}>
                <Form
                  action={action}
                  className="flex max-h-[88vh] flex-col"
                  onResult={(s) => {
                    if (s.ok) {
                      ref.current?.close();
                      router.refresh();
                    }
                  }}
                >
                  <div className="flex items-center justify-between border-b border-line px-6 py-4">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <button type="button" aria-label="Close dialog" onClick={() => ref.current?.close()} className="rounded p-1 text-slate-400 hover:bg-subtle focus-ring">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="space-y-4 overflow-y-auto px-6 py-5">
                    <p className="text-sm text-muted">From: {defaults.from}</p>
                    <Field name="to" label="To" type="email" required defaultValue={defaults.to} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field name="cc" label="CC" placeholder="Comma separated" />
                      <Field name="bcc" label="BCC" placeholder="Comma separated" />
                    </div>
                    <Field name="subject" label="Subject" required defaultValue={defaults.subject} />
                    <div className={html ? "hidden" : ""}>
                      <TemplateTextarea name="body" label="Body (HTML)" defaultValue={defaults.body} placeholders={placeholders} rows={7} />
                    </div>
                    {html ? (
                      <div>
                        <p className="mb-1 text-sm font-medium">Preview</p>
                        <iframe title="Email preview" srcDoc={html} sandbox="" className="h-96 w-full rounded-md border border-line" />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex justify-between gap-2 border-t border-line bg-subtle px-6 py-3">
                    <Button variant="secondary" onClick={() => (html ? setHtml(null) : doPreview())} disabled={pending}>
                      {pending ? <Spinner /> : null}
                      {html ? "Edit" : "Preview"}
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => ref.current?.close()}>
                        Cancel
                      </Button>
                      <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
                    </div>
                  </div>
                </Form>
              </div>
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
