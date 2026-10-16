/** Accessible grouped bar chart (SVG) with a data table fallback. Restrained palette per design rules. */
const SERIES = [
  { key: "sales", label: "Sales", color: "#1d4ed8" },
  { key: "receipts", label: "Receipts", color: "#0f766e" },
  { key: "expenses", label: "Expenses", color: "#94a3b8" },
] as const;

export function CashFlowChart({
  rows,
  labelFor,
  format,
  compact,
}: {
  rows: { key: string; sales: number; receipts: number; expenses: number; net: number }[];
  labelFor: (key: string) => string;
  format: (v: number) => string;
  compact: (v: number) => string;
}) {
  const W = 760;
  const H = 240;
  const pad = { l: 56, r: 8, t: 10, b: 28 };
  const max = Math.max(1, ...rows.flatMap((r) => [r.sales, r.receipts, r.expenses]));
  const step = (W - pad.l - pad.r) / Math.max(1, rows.length);
  const bw = Math.max(2, Math.min(14, (step - 6) / 3));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const every = Math.ceil(rows.length / 12);
  return (
    <figure>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-2" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Sales, receipts and expenses per period">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#64748b">
              {compact(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x0 = pad.l + i * step + (step - bw * 3) / 2;
          return (
            <g key={r.key}>
              {SERIES.map((s, j) => {
                const v = r[s.key];
                return (
                  <rect key={s.key} x={x0 + j * bw} y={y(v)} width={bw - 1} height={Math.max(0, H - pad.b - y(v))} fill={s.color}>
                    <title>{`${labelFor(r.key)} · ${s.label}: ${format(v)}`}</title>
                  </rect>
                );
              })}
              {i % every === 0 ? (
                <text x={pad.l + i * step + step / 2} y={H - 10} textAnchor="middle" fontSize="10" fill="#64748b">
                  {labelFor(r.key)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">Show data table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-4">Period</th>
                {SERIES.map((s) => <th key={s.key} className="py-1 pr-4 text-right">{s.label}</th>)}
                <th className="py-1 text-right">Net income</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <td className="py-1 pr-4">{labelFor(r.key)}</td>
                  {SERIES.map((s) => <td key={s.key} className="tabular py-1 pr-4 text-right">{format(r[s.key])}</td>)}
                  <td className="tabular py-1 text-right">{format(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
