"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { inputClass, Spinner } from "@/components/ui/primitives";
import { FLASH_CHECK_EVENT, toast } from "@/components/toast";

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type Ctx = { state: ActionState; pending: boolean };
const FormContext = createContext<Ctx>({ state: null, pending: false });

export function useFormContext() {
  return useContext(FormContext);
}

export function Form({
  action,
  children,
  className,
  resetOnSuccess = false,
  onResult,
  showErrorSummary = false,
  ...rest
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onResult?: (state: NonNullable<ActionState>) => void;
  showErrorSummary?: boolean;
} & Omit<ComponentProps<"form">, "action" | "onSubmit" | "children" | "className">) {
  const [state, dispatch, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });

  useEffect(() => {
    if (!state?.at) return;
    if (state.ok) {
      if (state.message) toast(state.message, "success");
      if (resetOnSuccess) formRef.current?.reset();
    } else if (state.error) {
      toast(state.error, "error");
      const firstInvalid = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
      firstInvalid?.focus();
    }
    onResultRef.current?.(state);
    window.dispatchEvent(new Event(FLASH_CHECK_EVENT));
  }, [state, resetOnSuccess]);

  return (
    <FormContext.Provider value={{ state, pending }}>
      <form
        ref={formRef}
        noValidate
        className={className}
        aria-busy={pending}
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const fd = new FormData(e.currentTarget, submitter);
          startTransition(() => dispatch(fd));
        }}
        {...rest}
      >
        {showErrorSummary && state && !state.ok && state.error ? (
          <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {state.error}
          </div>
        ) : null}
        {children}
      </form>
    </FormContext.Provider>
  );
}

export function Label({
  htmlFor,
  children,
  required,
  className,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-sm font-medium text-ink", className)}>
      {children}
      {required ? (
        <span className="ml-0.5 text-red-600" aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
  );
}

export function useFieldError(name: string): string | undefined {
  const { state } = useFormContext();
  return state?.fieldErrors?.[name]?.[0];
}

export function FieldError({ name, id }: { name: string; id?: string }) {
  const err = useFieldError(name);
  if (!err) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-red-600">
      {err}
    </p>
  );
}

type BaseFieldProps = {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
};

function FieldShell({
  id,
  name,
  label,
  hint,
  required,
  className,
  children,
}: BaseFieldProps & { id: string; children: ReactNode }) {
  const err = useFieldError(name);
  return (
    <div className={className}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {err ? (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-600">
          {err}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, err: string | undefined, hint: ReactNode) {
  return err ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export function Field({
  name,
  label,
  hint,
  required,
  className,
  inputClassName,
  ...input
}: BaseFieldProps & { inputClassName?: string } & Omit<ComponentProps<"input">, "name" | "className">) {
  const id = useId();
  const err = useFieldError(name);
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} required={required} className={className}>
      <input
        id={id}
        name={name}
        aria-invalid={err ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(id, err, hint)}
        className={cn(inputClass, inputClassName)}
        {...input}
      />
    </FieldShell>
  );
}

export function TextareaField({
  name,
  label,
  hint,
  required,
  className,
  ...input
}: BaseFieldProps & Omit<ComponentProps<"textarea">, "name" | "className">) {
  const id = useId();
  const err = useFieldError(name);
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} required={required} className={className}>
      <textarea
        id={id}
        name={name}
        rows={3}
        aria-invalid={err ? true : undefined}
        aria-describedby={describedBy(id, err, hint)}
        className={inputClass}
        {...input}
      />
    </FieldShell>
  );
}

export type Option = { value: string; label: string };

export function SelectField({
  name,
  label,
  hint,
  required,
  className,
  options,
  placeholder,
  ...input
}: BaseFieldProps & { options: Option[]; placeholder?: string } & Omit<ComponentProps<"select">, "name" | "className">) {
  const id = useId();
  const err = useFieldError(name);
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} required={required} className={className}>
      <select
        id={id}
        name={name}
        aria-invalid={err ? true : undefined}
        aria-describedby={describedBy(id, err, hint)}
        className={inputClass}
        {...input}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  className,
  ...input
}: Omit<BaseFieldProps, "required"> & Omit<ComponentProps<"input">, "name" | "className" | "type">) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={id}
        name={name}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-700 focus-ring"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-xs text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  pendingLabel,
  ...props
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  pendingLabel?: string;
} & Omit<ComponentProps<"button">, "type" | "className" | "children">) {
  const { pending } = useFormContext();
  return (
    <button type="submit" disabled={pending || props.disabled} className={buttonClass(variant, size, className)} {...props}>
      {pending ? <Spinner /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
