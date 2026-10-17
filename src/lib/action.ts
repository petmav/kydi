import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/context";
import { checkPasswordPolicy } from "@/lib/auth/password-policy";

export type FieldErrors = Record<string, string[] | undefined>;

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: FieldErrors;
  /** Monotonic id so clients can react to repeated identical results. */
  at?: number;
  data?: Record<string, unknown>;
} | null;

export function success(message?: string, data?: Record<string, unknown>): ActionState {
  return { ok: true, message, data, at: Date.now() };
}

export function failure(error: string, fieldErrors?: FieldErrors): ActionState {
  return { ok: false, error, fieldErrors, at: Date.now() };
}

/** Converts FormData into a plain object; repeated keys become arrays. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (key in out) {
      const prev = out[key];
      out[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function parseForm<T extends z.ZodTypeAny>(
  schema: T,
  formData: FormData | Record<string, unknown>,
): { success: true; data: z.infer<T> } | { success: false; state: ActionState } {
  const input = formData instanceof FormData ? formToObject(formData) : formData;
  const result = schema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  const flat = result.error.flatten();
  const fieldErrors: FieldErrors = { ...flat.fieldErrors };
  // Surface nested issues (e.g. lines.0.price) under dotted keys.
  for (const issue of result.error.issues) {
    if (issue.path.length > 1) {
      const key = issue.path.join(".");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
  }
  return {
    success: false,
    state: failure(flat.formErrors[0] ?? "Please correct the highlighted fields.", fieldErrors),
  };
}

/** Wraps a server action body: maps ForbiddenError and unexpected errors to ActionState. */
export async function guard(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ForbiddenError) return failure(err.message);
    // Let Next.js redirects / notFound propagate.
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string") {
      const digest = (err as { digest: string }).digest;
      if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND") throw err;
    }
    console.error("[kydi] action failed", err);
    return failure("Something went wrong. Please try again.");
  }
}

// ---- common zod helpers ----------------------------------------------------
export const zTrimmed = z.string().trim();
export const zOptionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
export const zEmail = z.string().trim().toLowerCase().email("Enter a valid email address.");
export const zOptionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address.")
  .transform((v) => (v === "" ? null : v))
  .optional();
/** New passwords: length 10-200 and not a common password (src/lib/auth/password-policy.ts). */
export const zPassword = z.string().superRefine((value, ctx) => {
  const problem = checkPasswordPolicy(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});
export const zCheckbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal(""), z.literal("false"), z.literal("0")])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");
