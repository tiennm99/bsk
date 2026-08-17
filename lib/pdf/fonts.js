import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Register the Vietnamese-complete Be Vietnam Pro family with react-pdf.
 * react-pdf's built-in Helvetica drops VN diacritics (ế/ữ/ộ), so every PDF
 * uses this family. The TTFs live in public/fonts/ and are read from disk at
 * render time (Node runtime only). Idempotent — safe to call per request.
 */
let registered = false;

/** @returns {void} */
export function registerPdfFonts() {
  if (registered) return;
  Font.register({
    family: "Be Vietnam Pro",
    fonts: [
      { src: path.join(process.cwd(), "public/fonts/BeVietnamPro-Regular.ttf") },
      { src: path.join(process.cwd(), "public/fonts/BeVietnamPro-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  // react-pdf tries to hyphenate/word-break with a dictionary; disable so VN
  // text isn't split oddly.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
