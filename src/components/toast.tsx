"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Variant = "success" | "error" | "info";
type ToastItem = { id: number; message: string; variant: Variant };

const EVENT = "kydi:toast";
export const FLASH_CHECK_EVENT = "kydi:flash-check";
const FLASH_COOKIE = "kydi_flash";

/** Show a toast from any client component. */
export function toast(message: string, variant: Variant = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, variant } }));
}

function readFlash(): { message: string; variant: Variant } | null {
  const entry = document.cookie.split("; ").find((c) => c.startsWith(`${FLASH_COOKIE}=`));
  if (!entry) return null;
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
  try {
    const raw = decodeURIComponent(decodeURIComponent(entry.slice(FLASH_COOKIE.length + 1)));
    const parsed = JSON.parse(raw) as { message?: string; variant?: Variant };
    return parsed.message ? { message: parsed.message, variant: parsed.variant ?? "success" } : null;
  } catch {
    return null;
  }
}

let nextId = 1;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const pathname = usePathname();

  const push = useCallback((message: string, variant: Variant) => {
    const id = nextId++;
    setItems((prev) => [...prev.slice(-3), { id, message, variant }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), variant === "error" ? 7000 : 4500);
  }, []);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; variant: Variant }>).detail;
      push(detail.message, detail.variant);
    };
    const onFlashCheck = () => {
      const flash = readFlash();
      if (flash) push(flash.message, flash.variant);
    };
    window.addEventListener(EVENT, onToast);
    window.addEventListener(FLASH_CHECK_EVENT, onFlashCheck);
    return () => {
      window.removeEventListener(EVENT, onToast);
      window.removeEventListener(FLASH_CHECK_EVENT, onFlashCheck);
    };
  }, [push]);

  useEffect(() => {
    const flash = readFlash();
    if (flash) push(flash.message, flash.variant);
  }, [pathname, push]);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {items.map((t) => {
        const Icon = t.variant === "success" ? CheckCircle2 : t.variant === "error" ? XCircle : Info;
        return (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            className={cn(
              "animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border bg-white px-4 py-3 text-sm shadow-lg",
              t.variant === "error" ? "border-red-200" : "border-line",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                t.variant === "success" && "text-emerald-600",
                t.variant === "error" && "text-red-600",
                t.variant === "info" && "text-brand-600",
              )}
            />
            <p className="flex-1 text-ink">{t.message}</p>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="rounded p-0.5 text-slate-400 hover:text-slate-700 focus-ring"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
