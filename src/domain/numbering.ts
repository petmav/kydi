import { format as dfFormat } from "date-fns";

/** Document number formats, spec §3.21. Example: {{SERIES:INV}}{{DELIMITER:-}}{{SEQUENCE:6}} -> INV-000001 */

export type NumberToken = { name: string; value?: string };

export const TOKEN_NAMES = ["SERIES", "DELIMITER", "SEQUENCE", "CUSTOMER_SEQUENCE", "CUSTOMER_SERIES", "DATE_FORMAT", "RANDOM_SEQUENCE"] as const;

export function parseNumberFormat(format: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  const re = /\{\{([A-Z_]+)(?::([^}]*))?\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(format))) tokens.push({ name: m[1], value: m[2] });
  return tokens;
}

export function validateNumberFormat(format: string): string | null {
  const tokens = parseNumberFormat(format);
  if (tokens.length === 0) return "The format must contain at least one token.";
  for (const t of tokens) {
    if (!(TOKEN_NAMES as readonly string[]).includes(t.name)) return `Unknown token ${t.name}.`;
    if (t.name === "SERIES" && t.value !== undefined && !/^(\w{1,6}|.)$/.test(t.value)) {
      return "SERIES must be up to 6 letters/digits or a single character.";
    }
    if (["SEQUENCE", "CUSTOMER_SEQUENCE", "RANDOM_SEQUENCE"].includes(t.name) && t.value !== undefined && t.value !== "") {
      const n = Number(t.value);
      if (!Number.isInteger(n) || n < 1 || n > 20) return `${t.name} length must be between 1 and 20.`;
    }
  }
  if (!tokens.some((t) => ["SEQUENCE", "CUSTOMER_SEQUENCE", "RANDOM_SEQUENCE"].includes(t.name))) {
    return "Include SEQUENCE, CUSTOMER_SEQUENCE or RANDOM_SEQUENCE so numbers stay unique.";
  }
  return null;
}

const PHP_TO_DATEFNS: Record<string, string> = { Y: "yyyy", y: "yy", m: "MM", n: "M", d: "dd", j: "d", M: "MMM", F: "MMMM", D: "EEE" };

function phpDate(pattern: string, date: Date): string {
  return pattern
    .split("")
    .map((ch) => (PHP_TO_DATEFNS[ch] ? dfFormat(date, PHP_TO_DATEFNS[ch]) : ch))
    .join("");
}

export type NumberContext = {
  sequence: number;
  customerSequence?: number;
  customerPrefix?: string | null;
  /** Company-local "today" as a local Date. */
  date?: Date;
  random?: (length: number) => string;
};

function randomHex(len: number): string {
  const bytes = new Uint8Array(Math.ceil(len / 2));
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, len).toUpperCase();
}

const pad = (n: number, len: number) => String(n).padStart(len, "0");

export function renderNumber(format: string, ctx: NumberContext): string {
  const random = ctx.random ?? randomHex;
  return parseNumberFormat(format)
    .map((t) => {
      const len = t.value ? Number(t.value) || 6 : 6;
      switch (t.name) {
        case "SERIES":
        case "DELIMITER":
          return t.value ?? "";
        case "SEQUENCE":
          return pad(ctx.sequence, len);
        case "CUSTOMER_SEQUENCE":
          return pad(ctx.customerSequence ?? 1, len);
        case "CUSTOMER_SERIES":
          return ctx.customerPrefix?.trim() || "CST";
        case "DATE_FORMAT":
          return phpDate(t.value || "Y", ctx.date ?? new Date());
        case "RANDOM_SEQUENCE":
          return random(len);
        default:
          return "";
      }
    })
    .join("");
}
