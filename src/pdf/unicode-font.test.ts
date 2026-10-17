import { constants, inflateSync } from "node:zlib";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { DocumentPdf, type PdfDoc } from "@/pdf/document-pdf";
import { pdfFontName } from "@/pdf/fonts";

/** Inflates every FlateDecode stream so the font subset and its ToUnicode map can be inspected. */
function streams(pdf: Buffer): string[] {
  const out: string[] = [];
  const raw = pdf.toString("latin1");
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end === -1) break;
    try {
      out.push(inflateSync(pdf.subarray(start, end), { finishFlush: constants.Z_SYNC_FLUSH }).toString("latin1"));
    } catch {
      // not deflated (or trailing EOL): ignore
    }
    re.lastIndex = end + "endstream".length;
  }
  return out;
}

const text = "Ελληνικά Кириллица Łódź Ševčík €";

const doc: PdfDoc = {
  variant: "1",
  title: "Invoice",
  logo: null,
  companyName: "Kydi Test Ltd",
  companyBlock: [{ text: "Kydi Test Ltd", bold: true, heading: false }],
  billBlock: [{ text, bold: true, heading: false }],
  shipBlock: [],
  details: [{ label: "Invoice number", value: "INV-000001" }],
  banner: null,
  extraColumns: [],
  showDiscount: false,
  showTax: false,
  lines: [{ name: "Συμβουλευτική", description: "Консультация", quantity: "1", price: "€100.00", discount: null, tax: null, amount: "€100.00", extra: [] }],
  totals: [{ label: "Total", value: "€100.00", strong: true }],
  notes: [{ text: "Ευχαριστούμε · Спасибо", bold: false, heading: false }],
  portal: { url: "https://kydi.example.org/portal/kydi-test/login", displayUrl: "https://kydi.example.org/portal/kydi-test/login", email: "billing@example.org" },
  footer: "Kydi Test Ltd · INV-000001",
};

describe("bundled Unicode PDF font", () => {
  it("embeds DejaVu Sans and maps Greek, Cyrillic and Latin Extended glyphs", async () => {
    expect(pdfFontName).toBe("DejaVu Sans");
    const pdf = await renderToBuffer(createElement(DocumentPdf, { d: doc }) as unknown as ReactElement<DocumentProps>);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.toString("latin1")).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+DejaVuSans/);
    expect(pdf.toString("latin1")).not.toMatch(/\/BaseFont\s*\/Helvetica/);
    // The portal box is a clickable link to the portal sign-in page.
    expect(pdf.toString("latin1")).toMatch(/\/URI\s*\(https:\/\/kydi\.example\.org\/portal\/kydi-test\/login\)/);
    const cmaps = streams(pdf).filter((s) => s.includes("begincmap")).join("\n").toUpperCase();
    // ToUnicode entries for: Greek small epsilon, Cyrillic capital KA, L with stroke, S with caron, c with caron, euro sign.
    for (const cp of ["03B5", "041A", "0141", "0160", "010D", "20AC"]) expect(cmaps, `U+${cp}`).toContain(`<${cp}>`);
  }, 30000);
});
