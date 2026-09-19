/**
 * Pure line reconstruction for PDF.js text items. Kept separate from pdf.ts so
 * it can be unit-tested without importing PDF.js.
 */

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  height: number;
  hasEOL?: boolean;
}

/**
 * Group text items into lines. Items arrive in content order; a new line starts
 * on `hasEOL` or a vertical jump larger than roughly half the glyph height.
 */
export function groupLines(items: ReadonlyArray<PdfTextItem>): string[] {
  const lines: string[] = [];
  let current = "";
  let lastY: number | null = null;

  const flush = (): void => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text.length > 0) lines.push(text);
    current = "";
  };

  for (const item of items) {
    if (!item || typeof item.str !== "string") continue;
    const height = item.height > 0 ? item.height : 10;
    const jumped = lastY !== null && Math.abs(item.y - lastY) > Math.max(2, height * 0.6);
    if (jumped) flush();
    if (current.length > 0 && !current.endsWith(" ") && !item.str.startsWith(" ")) current += " ";
    current += item.str;
    if (item.hasEOL) flush();
    lastY = item.y;
  }
  flush();
  return lines;
}
