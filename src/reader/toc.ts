/**
 * Pure shaping for the reader's table of contents.
 *
 * No DOM and no storage live here. The reader extracts a page summary (PDF) or
 * chapter path list (EPUB) and these functions turn that into the flat,
 * depth-annotated list the panel renders. Keeping it pure means the entry
 * shapes, label truncation and EPUB id→chapter mapping are unit-tested without
 * a browser.
 */

export interface TocItem {
  /** Zero-based page (PDF) or chapter (EPUB) index to jump to. */
  target: number;
  /** Short, safe, possibly truncated label. */
  label: string;
  /** Nesting level: always 0 for PDF, from the EPUB nav/NCX for EPUB. */
  depth: number;
  /** Leading marker: the page number for PDF, empty for EPUB. */
  marker: string;
}

export interface PdfPageSummary {
  /** One-based page number. */
  page: number;
  /** First extracted line of the page, or "" when the page has no text. */
  firstLine: string;
}

/** A minimal view of the EPUB TOC entry the handle exposes. */
export interface EpubTocLike {
  id: string;
  label: string;
  depth: number;
}

const ELLIPSIS = "\u2026";
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;
const WHITESPACE_RE = /\s+/g;
const TRAILING_PUNCT_RE = /[\s.,;:!?/\\-]+$/;

/**
 * Collapse whitespace, drop control characters and shorten to at most `max`
 * characters, preferring to cut on a word boundary. `max <= 1` yields "" or a
 * single character, never more.
 */
export function truncateLabel(text: string, max = 80): string {
  const clean = String(text ?? "")
    .replace(CONTROL_RE, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();
  const budget = Math.max(0, Math.trunc(max));
  if (budget === 0) return "";
  if (clean.length <= budget) return clean;
  if (budget === 1) return clean.slice(0, 1);

  const slice = clean.slice(0, budget - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace >= Math.floor((budget - 1) * 0.6) ? slice.slice(0, lastSpace) : slice;
  return cut.replace(TRAILING_PUNCT_RE, "") + ELLIPSIS;
}

/** Shape one entry per PDF page: `marker` is the page, `label` its first line. */
export function pdfTocEntries(pages: readonly PdfPageSummary[], max = 80): TocItem[] {
  return pages.map((summary, i) => {
    const page = Number.isFinite(summary?.page) ? Math.trunc(summary.page) : i + 1;
    const first = truncateLabel(summary?.firstLine ?? "", max);
    return {
      target: Math.max(0, page - 1),
      label: first.length > 0 ? first : "(no extractable text)",
      depth: 0,
      marker: String(page),
    };
  });
}

function pathKey(path: string): string {
  return String(path ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .toLowerCase();
}

function baseName(path: string): string {
  const key = pathKey(path);
  const idx = key.lastIndexOf("/");
  return idx < 0 ? key : key.slice(idx + 1);
}

/**
 * Resolve an EPUB TOC id to a spine index. Ids with no fragment are resolved
 * paths from `parseTocNav`/`parseTocNcx`, so an exact (case-insensitive) match
 * works; a basename match covers hrefs that were relativised differently.
 */
export function matchChapter(chapterPaths: readonly string[], id: string): number | null {
  const key = pathKey(id);
  if (key.length === 0) return null;
  for (let i = 0; i < chapterPaths.length; i += 1) {
    if (pathKey(chapterPaths[i] ?? "") === key) return i;
  }
  const base = baseName(id);
  if (base.length === 0) return null;
  for (let i = 0; i < chapterPaths.length; i += 1) {
    if (baseName(chapterPaths[i] ?? "") === base) return i;
  }
  return null;
}

/**
 * Shape the parsed EPUB TOC. Entries are mapped to a spine index by matching
 * their id against the chapter paths; fragment-only ids (which lose their file
 * part in `tocId`) inherit the previous entry's chapter, and unlabelled
 * entries are dropped. When the TOC and spine line up one-to-one, order is
 * trusted directly.
 */
export function epubTocEntries(
  toc: readonly EpubTocLike[],
  chapterPaths: readonly string[],
  max = 80,
): TocItem[] {
  const count = chapterPaths.length;
  const positional = count > 0 && toc.length === count;
  const out: TocItem[] = [];
  let carried = 0;

  for (let i = 0; i < toc.length; i += 1) {
    const entry = toc[i];
    if (!entry) continue;
    const label = truncateLabel(entry.label, max);
    if (label.length === 0) continue;

    let target: number;
    if (positional) {
      target = i;
    } else {
      const matched = matchChapter(chapterPaths, entry.id);
      target = matched === null ? carried : matched;
    }
    if (count > 0) target = Math.min(count - 1, Math.max(0, target));
    else target = Math.max(0, target);
    carried = target;

    const depth = Number.isFinite(entry.depth) ? Math.max(0, Math.trunc(entry.depth)) : 0;
    out.push({ target, label, depth, marker: "" });
  }

  return out;
}
