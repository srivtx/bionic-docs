/**
 * Pure page geometry for PDF.js text items. Like lines.ts it has no PDF.js or
 * DOM import, so the placement and matching maths can be unit-tested directly.
 *
 * All outputs are in the units of the viewport transform passed in (CSS or
 * canvas pixels, y growing downwards).
 */

export interface ItemLike {
  transform: number[];
  width: number;
  height: number;
}

export interface StyleLike {
  ascent?: number;
  descent?: number;
  vertical?: boolean;
}

export interface ItemGeometry {
  /** Top-left of the (unrotated) text box, before any rotation transform. */
  left: number;
  top: number;
  fontHeight: number;
  /** Radians, in screen space. */
  angle: number;
  /** Width the original text run occupied. */
  targetWidth: number;
  /** Baseline-left origin of the run. */
  originX: number;
  originY: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Point {
  x: number;
  y: number;
}

const DEFAULT_ASCENT = 0.8;

/** 2D affine multiply, the same maths as PDF.js `Util.transform`. */
export function multiplyTransform(m1: number[], m2: number[]): number[] {
  const [a1 = 1, b1 = 0, c1 = 0, d1 = 1, e1 = 0, f1 = 0] = m1;
  const [a2 = 1, b2 = 0, c2 = 0, d2 = 1, e2 = 0, f2 = 0] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function ascentRatio(style: StyleLike | undefined): number {
  let ratio = DEFAULT_ASCENT;
  if (style) {
    if (typeof style.ascent === "number" && Number.isFinite(style.ascent) && style.ascent > 0) ratio = style.ascent;
    else if (typeof style.descent === "number" && Number.isFinite(style.descent) && style.descent !== 0) {
      ratio = 1 + style.descent;
    }
  }
  return Math.min(1, Math.max(0.5, ratio));
}

/** Where a text item sits in the viewport, mirroring PDF.js's own text layer. */
export function itemGeometry(
  item: ItemLike,
  style: StyleLike | undefined,
  viewportTransform: number[],
): ItemGeometry {
  const tx = multiplyTransform(viewportTransform, item.transform);
  const vertical = Boolean(style?.vertical);
  let angle = Math.atan2(tx[1] ?? 0, tx[0] ?? 1);
  if (vertical) angle += Math.PI / 2;
  const fontHeight = Math.hypot(tx[2] ?? 0, tx[3] ?? 0);
  const fontAscent = fontHeight * ascentRatio(style);
  const originX = tx[4] ?? 0;
  const originY = tx[5] ?? 0;
  let left: number;
  let top: number;
  if (angle === 0) {
    left = originX;
    top = originY - fontAscent;
  } else {
    left = originX + fontAscent * Math.sin(angle);
    top = originY - fontAscent * Math.cos(angle);
  }
  const viewportScale = Math.hypot(viewportTransform[0] ?? 1, viewportTransform[1] ?? 0);
  const targetWidth = (vertical ? item.height : item.width) * viewportScale;
  return { left, top, fontHeight, angle, targetWidth, originX, originY };
}

/**
 * Axis-aligned bounds of the run's rectangle: it starts at the baseline origin,
 * is `targetWidth` long along `angle` and `fontHeight` tall above the baseline.
 */
export function itemBox(geom: ItemGeometry, tolerance: number): Box {
  const ux = Math.cos(geom.angle);
  const uy = Math.sin(geom.angle);
  // "Up" from the baseline; for angle 0 this is -y because y grows downwards.
  const vx = Math.sin(geom.angle);
  const vy = -Math.cos(geom.angle);
  const w = Number.isFinite(geom.targetWidth) && geom.targetWidth > 0 ? geom.targetWidth : 0;
  const h = Number.isFinite(geom.fontHeight) && geom.fontHeight > 0 ? geom.fontHeight : 0;
  const xs = [0, ux * w, vx * h, ux * w + vx * h].map((d) => geom.originX + d);
  const ys = [0, uy * w, vy * h, uy * w + vy * h].map((d) => geom.originY + d);
  return {
    x0: Math.min(...xs) - tolerance,
    y0: Math.min(...ys) - tolerance,
    x1: Math.max(...xs) + tolerance,
    y1: Math.max(...ys) + tolerance,
  };
}

/** Horizontal scale that makes a measured run as wide as the original one. */
export function fitScale(targetWidth: number, naturalWidth: number): number {
  if (!Number.isFinite(targetWidth) || !Number.isFinite(naturalWidth)) return 1;
  if (targetWidth <= 0 || naturalWidth <= 0) return 1;
  return Math.min(5, Math.max(0.2, targetWidth / naturalWidth));
}

export interface SampleMatch {
  /** Per box: index of the first sample inside it, or -1. */
  itemSample: Int32Array;
  /** Sample indexes that fall inside no box at all. */
  unmatched: number[];
}

const CELL = 32;
const MAX_CELLS_PER_BOX = 400;

/**
 * Work out which glyph samples belong to which text boxes. A sample inside
 * several overlapping boxes counts for each of them, so a neighbouring run can
 * never steal the only glyph of another. Uses a uniform grid, so it is roughly
 * linear in boxes plus samples.
 */
export function matchSamples(boxes: ReadonlyArray<Box>, samples: ReadonlyArray<Point>): SampleMatch {
  const itemSample = new Int32Array(boxes.length).fill(-1);
  const unmatched: number[] = [];
  const grid = new Map<number, number[]>();
  const oversized: number[] = [];
  const key = (cx: number, cy: number): number => cx * 100003 + cy;

  boxes.forEach((box, index) => {
    if (![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)) return;
    const cx0 = Math.floor(box.x0 / CELL);
    const cx1 = Math.floor(box.x1 / CELL);
    const cy0 = Math.floor(box.y0 / CELL);
    const cy1 = Math.floor(box.y1 / CELL);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_CELLS_PER_BOX) {
      oversized.push(index);
      return;
    }
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        const k = key(cx, cy);
        const list = grid.get(k);
        if (list) list.push(index);
        else grid.set(k, [index]);
      }
    }
  });

  const inside = (box: Box, p: Point): boolean => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;

  samples.forEach((sample, s) => {
    let hit = false;
    const visit = (index: number): void => {
      const box = boxes[index];
      if (!box || !inside(box, sample)) return;
      hit = true;
      if (itemSample[index] === -1) itemSample[index] = s;
    };
    if (Number.isFinite(sample.x) && Number.isFinite(sample.y)) {
      const list = grid.get(key(Math.floor(sample.x / CELL), Math.floor(sample.y / CELL)));
      if (list) for (const index of list) visit(index);
      for (const index of oversized) visit(index);
    }
    if (!hit) unmatched.push(s);
  });

  return { itemSample, unmatched };
}
