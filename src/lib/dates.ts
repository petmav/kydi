import { format as dfFormat, isValid, parse } from "date-fns";

/** Date-only values travel as "yyyy-MM-dd" strings and are stored as UTC-midnight Dates (@db.Date). */

export function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function parseIsoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return isNaN(d.getTime()) || isoDate(d) !== s ? null : d;
}

export function addDaysIso(s: string, days: number): string {
  const d = parseIsoDate(s);
  if (!d) return s;
  // Pure UTC arithmetic: local-time helpers skip or repeat a day across the server's DST changes.
  return isoDate(new Date(d.getTime() + days * 86400000));
}

/** Wall-clock parts of an instant in an IANA zone. */
export function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: wd,
  };
}

/** Converts a wall-clock time in `timeZone` to the UTC instant. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (t: number) => {
    const p = zonedParts(new Date(t), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  const first = guess - offsetAt(guess);
  const second = guess - offsetAt(first);
  return new Date(second);
}

/** "Today" as yyyy-MM-dd in the company time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  const p = zonedParts(now, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Formats a date-only value (Date at UTC midnight or ISO string) with a date-fns pattern. */
export function formatDate(value: Date | string | null | undefined, pattern = "yyyy-MM-dd"): string {
  if (!value) return "";
  const d = typeof value === "string" ? parseIsoDate(value.slice(0, 10)) : value;
  if (!d) return "";
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  try {
    return dfFormat(local, pattern);
  } catch {
    return isoDate(d);
  }
}

/** Formats an instant in a zone, e.g. for timestamps. */
export function formatDateTime(value: Date | null | undefined, timeZone: string, pattern = "yyyy-MM-dd HH:mm"): string {
  if (!value) return "";
  const p = zonedParts(value, timeZone);
  return dfFormat(new Date(p.year, p.month - 1, p.day, p.hour, p.minute), pattern);
}

export function parseUserDate(s: string, pattern: string): Date | null {
  const d = parse(s, pattern, new Date());
  return isValid(d) ? d : null;
}

/** Start/end (inclusive, yyyy-MM-dd) of the fiscal year containing `today`. fiscal = "start-end" months. */
export function fiscalYearRange(fiscal: string, today: string): { from: string; to: string } {
  const start = Number(fiscal.split("-")[0]) || 1;
  const [y, m] = today.split("-").map(Number);
  const startYear = m >= start ? y : y - 1;
  const from = `${startYear}-${String(start).padStart(2, "0")}-01`;
  const endD = new Date(Date.UTC(startYear + 1, start - 1, 1));
  endD.setUTCDate(endD.getUTCDate() - 1);
  return { from, to: isoDate(endD) };
}
