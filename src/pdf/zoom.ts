/**
 * Pure zoom maths for the PDF reader. No DOM and no PDF.js, so the fit and
 * step rules are unit-tested directly.
 *
 * A zoom is either a fit mode or a scale where 1 means 100%: one PDF point is
 * drawn at 96/72 CSS pixels, the same "actual size" desktop viewers use.
 */

export type Zoom = "fit-page" | "fit-width" | number;

export const DEFAULT_ZOOM: Zoom = "fit-page";

/** CSS pixels per PDF point at 100%. */
export const CSS_PER_POINT = 96 / 72;

/** The scales the zoom buttons step through and the zoom menu lists. */
export const ZOOM_STEPS: readonly number[] = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export const MIN_ZOOM = ZOOM_STEPS[0]!;
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1]!;

export interface Size {
  width: number;
  height: number;
}

function positive(n: number, fallback: number): number {
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * The CSS width a page sheet should have. `page` is in PDF points, `avail` is
 * the room the reader has for one page in CSS pixels.
 */
export function sheetWidth(zoom: Zoom, page: Size, avail: Size): number {
  const pw = positive(page.width, 612);
  const ph = positive(page.height, 792);
  const aw = positive(avail.width, 800);
  const ah = positive(avail.height, 600);
  if (zoom === "fit-width") return Math.max(1, Math.floor(aw));
  if (zoom === "fit-page") return Math.max(1, Math.floor(Math.min(aw, (ah * pw) / ph)));
  return Math.max(1, Math.round(pw * CSS_PER_POINT * clampZoom(zoom)));
}

/** The scale (1 = 100%) a page is shown at for a given zoom. */
export function effectiveScale(zoom: Zoom, page: Size, avail: Size): number {
  return sheetWidth(zoom, page, avail) / (positive(page.width, 612) * CSS_PER_POINT);
}

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/** The next step strictly above (dir 1) or below (dir -1) the current scale. */
export function stepZoom(scale: number, dir: 1 | -1): number {
  const current = clampZoom(scale);
  if (dir === 1) {
    for (const step of ZOOM_STEPS) if (step > current + 0.005) return step;
    return MAX_ZOOM;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1) {
    const step = ZOOM_STEPS[i]!;
    if (step < current - 0.005) return step;
  }
  return MIN_ZOOM;
}

/** Serialize a zoom for a <select> value or storage. */
export function zoomValue(zoom: Zoom): string {
  return typeof zoom === "number" ? String(clampZoom(zoom)) : zoom;
}

/** Parse a stored or selected zoom; anything unknown falls back to the default. */
export function parseZoom(value: unknown): Zoom {
  if (value === "fit-page" || value === "fit-width") return value;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (Number.isFinite(n) && n > 0) return clampZoom(n);
  return DEFAULT_ZOOM;
}

export function zoomLabel(zoom: Zoom): string {
  if (zoom === "fit-page") return "Fit page";
  if (zoom === "fit-width") return "Fit width";
  return `${Math.round(clampZoom(zoom) * 100)}%`;
}
