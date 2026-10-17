import { existsSync } from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Bundled PDF font: DejaVu Sans (Bitstream Vera licence, see assets/fonts/DejaVu-LICENSE.txt). Unlike the
 * built-in Helvetica it covers Latin Extended, Greek, Cyrillic and many symbols. The files are copied into the
 * standalone build by `outputFileTracingIncludes` in next.config.ts. Falls back to Helvetica if missing.
 */

const FAMILY = "DejaVu Sans";

function fontDir(): string | null {
  const candidates = [process.env.KYDI_FONT_DIR, path.join(process.cwd(), "assets", "fonts")].filter(Boolean) as string[];
  return candidates.find((d) => existsSync(path.join(d, "DejaVuSans.ttf"))) ?? null;
}

function register(): boolean {
  const dir = fontDir();
  if (!dir) {
    console.warn("[kydi] DejaVu Sans not found; PDFs fall back to Helvetica (Latin-1 only).");
    return false;
  }
  Font.register({
    family: FAMILY,
    fonts: [
      { src: path.join(dir, "DejaVuSans.ttf") },
      { src: path.join(dir, "DejaVuSans-Bold.ttf"), fontWeight: "bold" },
      { src: path.join(dir, "DejaVuSans-Oblique.ttf"), fontStyle: "italic" },
    ],
  });
  return true;
}

const bundled = register();

/** Style fragments for regular and bold text in PDF stylesheets. */
export const fontRegular = bundled ? { fontFamily: FAMILY } : { fontFamily: "Helvetica" };
export const fontBold = bundled ? { fontFamily: FAMILY, fontWeight: "bold" as const } : { fontFamily: "Helvetica-Bold" };
export const pdfFontName = bundled ? FAMILY : "Helvetica";
