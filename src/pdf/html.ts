/** Minimal HTML -> text blocks for PDFs (react-pdf cannot render HTML). Tags are stripped safely. */
export type Block = { text: string; bold: boolean; heading: boolean };

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export function decode(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

/** Replace characters the built-in PDF fonts cannot encode (narrow/no-break spaces etc.). */
export function pdfText(s: string): string {
  return s.replace(/[   ]/g, " ").replace(/[−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

export function htmlToBlocks(html: string | null | undefined): Block[] {
  if (!html) return [];
  const normalized = html
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "$&\n");
  const out: Block[] = [];
  for (const rawLine of normalized.split("\n")) {
    const heading = /<h[1-6][^>]*>/i.test(rawLine);
    const bold = heading || /<(strong|b)[^>]*>/i.test(rawLine);
    const text = pdfText(decode(rawLine.replace(/<[^>]+>/g, "")).trim());
    if (text) out.push({ text, bold, heading });
  }
  return out;
}
