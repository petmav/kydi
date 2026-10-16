import { zonedParts, zonedToUtc } from "@/lib/dates";

/** Minimal 5-field cron evaluator (minute hour day-of-month month day-of-week) in an IANA zone. */

type Field = { values: number[]; any: boolean };
export type Cron = { minute: Field; hour: Field; dom: Field; month: Field; dow: Field };

const RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

function parseField(src: string, [min, max]: [number, number], isDow: boolean): Field {
  const set = new Set<number>();
  for (const part of src.split(",")) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) throw new Error(`Invalid cron field "${src}"`);
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) throw new Error(`Invalid step in "${src}"`);
    let lo = min;
    let hi = max;
    if (m[1] !== "*") {
      const [a, b] = m[1].split("-").map(Number);
      lo = a;
      hi = b ?? (m[2] ? max : a);
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`Value out of range in "${src}"`);
    for (let v = lo; v <= hi; v += step) set.add(isDow && v === 7 ? 0 : v);
  }
  return { values: [...set].sort((a, b) => a - b), any: src === "*" };
}

export function parseCron(expr: string): Cron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("A cron expression needs exactly 5 fields.");
  const [minute, hour, dom, month, dow] = parts.map((p, i) => parseField(p, RANGES[i], i === 4));
  return { minute, hour, dom, month, dow };
}

export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

function dayMatches(c: Cron, month: number, day: number, weekday: number): boolean {
  if (!c.month.values.includes(month)) return false;
  const domOk = c.dom.values.includes(day);
  const dowOk = c.dow.values.includes(weekday);
  if (c.dom.any && c.dow.any) return true;
  if (c.dom.any) return dowOk;
  if (c.dow.any) return domOk;
  return domOk || dowOk; // classic cron: either restriction matches
}

/** First occurrence strictly after `after`, evaluated in `timeZone`. */
export function nextOccurrence(expr: string | Cron, after: Date, timeZone: string): Date | null {
  const c = typeof expr === "string" ? parseCron(expr) : expr;
  const start = zonedParts(after, timeZone);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  for (let i = 0; i < 366 * 8; i++) {
    const y = cursor.getUTCFullYear();
    const mo = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    if (dayMatches(c, mo, d, cursor.getUTCDay())) {
      for (const h of c.hour.values) {
        for (const mi of c.minute.values) {
          const instant = zonedToUtc(y, mo, d, h, mi, timeZone);
          if (instant.getTime() <= after.getTime()) continue;
          const check = zonedParts(instant, timeZone);
          if (check.hour !== h || check.minute !== mi || check.day !== d) continue; // nonexistent (DST gap)
          return instant;
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}

export function upcomingOccurrences(expr: string, after: Date, timeZone: string, count = 5): Date[] {
  const c = parseCron(expr);
  const out: Date[] = [];
  let cur: Date | null = after;
  while (out.length < count && cur) {
    cur = nextOccurrence(c, cur, timeZone);
    if (cur) out.push(cur);
  }
  return out;
}

export const FREQUENCY_PRESETS = [
  { value: "0 0 * * 0", label: "Every week (Sunday)" },
  { value: "0 0 */14 * *", label: "Every 2 weeks" },
  { value: "0 0 1 * *", label: "Every month (1st)" },
  { value: "0 0 1 */2 *", label: "Every 2 months" },
  { value: "0 0 1 */3 *", label: "Every quarter" },
  { value: "0 0 1 */6 *", label: "Every 6 months" },
  { value: "0 0 1 1 *", label: "Every year (1 January)" },
  { value: "0 0 * * *", label: "Every day" },
  { value: "0 5 */15 * *", label: "Every 15 days at 00:05" },
  { value: "0 * * * *", label: "Every hour" },
  { value: "* * * * *", label: "Every minute" },
] as const;

export function frequencyLabel(expr: string): string {
  return FREQUENCY_PRESETS.find((p) => p.value === expr)?.label ?? `Custom (${expr})`;
}
