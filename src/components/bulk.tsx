"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action";
import { ConfirmButton } from "@/components/confirm";

type Ctx = { selected: Set<number>; toggle: (id: number, on: boolean) => void; setAll: (ids: number[], on: boolean) => void };
const BulkContext = createContext<Ctx | null>(null);

export function BulkProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number, on: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const setAll = (ids: number[], on: boolean) => setSelected(on ? new Set(ids) : new Set());
  return <BulkContext.Provider value={{ selected, toggle, setAll }}>{children}</BulkContext.Provider>;
}

function useBulk() {
  const c = useContext(BulkContext);
  if (!c) throw new Error("BulkProvider missing");
  return c;
}

export function SelectAll({ ids }: { ids: number[] }) {
  const { selected, setAll } = useBulk();
  const all = ids.length > 0 && ids.every((i) => selected.has(i));
  return (
    <input
      type="checkbox"
      aria-label="Select all rows"
      checked={all}
      onChange={(e) => setAll(ids, e.target.checked)}
      className="h-4 w-4 rounded border-slate-300 accent-brand-700 focus-ring"
    />
  );
}

export function RowCheck({ id, label }: { id: number; label: string }) {
  const { selected, toggle } = useBulk();
  return (
    <input
      type="checkbox"
      aria-label={`Select ${label}`}
      checked={selected.has(id)}
      onChange={(e) => toggle(id, e.target.checked)}
      className="h-4 w-4 rounded border-slate-300 accent-brand-700 focus-ring"
    />
  );
}

export function BulkDelete({ action, noun, warning }: { action: (ids: number[]) => Promise<ActionState>; noun: string; warning?: string }) {
  const { selected, setAll } = useBulk();
  if (selected.size === 0) return null;
  const ids = [...selected];
  return (
    <div className="flex items-center gap-3 border-b border-line bg-brand-50 px-4 py-2 text-sm">
      <span className="font-medium text-brand-900">{selected.size} selected</span>
      <ConfirmButton
        action={async () => {
          const r = await action(ids);
          if (r?.ok) setAll([], false);
          return r;
        }}
        title={`Delete ${selected.size} ${noun}?`}
        description={warning ?? "Are you sure? Deleted records cannot be recovered."}
        confirmLabel="Delete"
        size="sm"
      >
        Delete selected
      </ConfirmButton>
      <button type="button" className="text-brand-800 hover:underline focus-ring rounded" onClick={() => setAll([], false)}>
        Clear selection
      </button>
    </div>
  );
}
