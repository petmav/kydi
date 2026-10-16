import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline-danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-60";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900",
  secondary: "border border-slate-300 bg-white text-ink-2 shadow-sm hover:bg-subtle",
  ghost: "text-ink hover:bg-slate-100",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  "outline-danger": "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
