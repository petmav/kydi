import { cn } from "@/lib/utils";

export function InstallSteps({ current }: { current: 1 | 2 }) {
  const steps = ["Administrator account", "Company profile"];
  return (
    <ol className="mb-6 flex items-center gap-3 text-sm" aria-label="Installation progress">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                state === "done" && "bg-emerald-600 text-white",
                state === "current" && "bg-brand-600 text-white",
                state === "todo" && "bg-slate-200 text-slate-600",
              )}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={cn(state === "current" ? "font-medium text-ink" : "text-muted")}>{label}</span>
            {n < steps.length ? <span className="mx-1 h-px w-6 bg-line" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
