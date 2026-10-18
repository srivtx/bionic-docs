import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { groupLines, type PdfTextItem } from "../src/pdf/lines";
import { fitScale, itemBox, itemGeometry, matchSamples, multiplyTransform } from "../src/pdf/layout";

const item = (str: string, y: number, extra: Partial<PdfTextItem> = {}): PdfTextItem => ({
  str,
  x: 0,
  y,
  height: 10,
  ...extra,
});

describe("groupLines", () => {
  test("joins items on the same line with single spaces", () => {
    const lines = groupLines([item("Bionic", 100), item("reading", 100), item("works", 100)]);
    expect(lines).toEqual(["Bionic reading works"]);
  });

  test("starts a new line on a vertical jump", () => {
    const lines = groupLines([item("First line", 100), item("Second line", 80)]);
    expect(lines).toEqual(["First line", "Second line"]);
  });

  test("starts a new line on hasEOL", () => {
    const lines = groupLines([item("Alpha", 100, { hasEOL: true }), item("Beta", 100)]);
    expect(lines).toEqual(["Alpha", "Beta"]);
  });

  test("collapses runs of whitespace and trims", () => {
    const lines = groupLines([item("  spaced   out  ", 100)]);
    expect(lines).toEqual(["spaced out"]);
  });

  test("does not double-space when items already carry spaces", () => {
    const lines = groupLines([item("one ", 100), item("two", 100)]);
    expect(lines).toEqual(["one two"]);
  });

  test("ignores items without a string", () => {
    const lines = groupLines([
      item("keep", 100),
      { str: undefined as unknown as string, x: 0, y: 100, height: 10 },
    ]);
    expect(lines).toEqual(["keep"]);
  });

  test("returns nothing for an empty or whitespace-only list", () => {
    expect(groupLines([])).toEqual([]);
    expect(groupLines([item("   ", 100)])).toEqual([]);
  });

  test("preserves reading order across many lines", () => {
    const lines = groupLines([
      item("one", 300),
      item("two", 280),
      item("three", 260),
    ]);
    expect(lines).toEqual(["one", "two", "three"]);
  });
});

const FLIP = [1, 0, 0, -1, 0, 792];

describe("multiplyTransform", () => {
  test("identity leaves a matrix unchanged", () => {
    expect(multiplyTransform([1, 0, 0, 1, 0, 0], [2, 0, 0, 3, 4, 5])).toEqual([2, 0, 0, 3, 4, 5]);
  });

  test("applies the second matrix first, then the first", () => {
    expect(multiplyTransform([2, 0, 0, 2, 10, 0], [1, 0, 0, 1, 5, 5])).toEqual([2, 0, 0, 2, 20, 10]);
  });
});

describe("itemGeometry", () => {
  const item = { transform: [20, 0, 0, 20, 72, 720], width: 200, height: 20 };

  test("identity viewport keeps the baseline origin and font height", () => {
    const g = itemGeometry(item, { ascent: 0.9 }, [1, 0, 0, 1, 0, 0]);
    expect(g.originX).toBe(72);
    expect(g.originY).toBe(720);
    expect(g.fontHeight).toBe(20);
    expect(g.left).toBe(72);
    expect(g.top).toBeCloseTo(720 - 18, 6);
    expect(g.targetWidth).toBe(200);
  });

  test("a y-flipped viewport puts top at page height - y - ascent", () => {
    const g = itemGeometry(item, { ascent: 0.8 }, FLIP);
    expect(g.top).toBeCloseTo(792 - 720 - 16, 6);
    expect(g.left).toBe(72);
    expect(g.angle).toBe(0);
  });

  test("scaling the viewport scales every output and the target width", () => {
    const g = itemGeometry(item, { ascent: 0.8 }, [2, 0, 0, -2, 0, 1584]);
    expect(g.fontHeight).toBe(40);
    expect(g.targetWidth).toBe(400);
    expect(g.left).toBe(144);
  });

  test("falls back to 1 + descent, then to 0.8, and clamps the ratio", () => {
    expect(itemGeometry(item, { descent: -0.25 }, [1, 0, 0, 1, 0, 0]).top).toBeCloseTo(720 - 15, 6);
    expect(itemGeometry(item, undefined, [1, 0, 0, 1, 0, 0]).top).toBeCloseTo(720 - 16, 6);
    expect(itemGeometry(item, { ascent: 5 }, [1, 0, 0, 1, 0, 0]).top).toBeCloseTo(720 - 20, 6);
    expect(itemGeometry(item, { ascent: 0.1 }, [1, 0, 0, 1, 0, 0]).top).toBeCloseTo(720 - 10, 6);
  });

  test("a 90 degree rotated item reports its angle and shifts left/top", () => {
    const rotated = { transform: [0, 20, -20, 0, 100, 300], width: 150, height: 20 };
    const g = itemGeometry(rotated, { ascent: 0.8 }, FLIP);
    expect(g.angle).toBeCloseTo(-Math.PI / 2, 6);
    expect(g.fontHeight).toBeCloseTo(20, 6);
    expect(g.left).toBeCloseTo(100 - 16, 6);
    expect(g.top).toBeCloseTo(792 - 300, 6);
    expect(g.targetWidth).toBe(150);
  });

  test("vertical writing swaps the width source and turns the angle", () => {
    const g = itemGeometry({ transform: [10, 0, 0, 10, 0, 0], width: 5, height: 80 }, { vertical: true }, FLIP);
    expect(g.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(g.targetWidth).toBe(80);
  });
});

describe("itemBox", () => {
  test("covers the run above the baseline, plus the tolerance", () => {
    const g = itemGeometry({ transform: [20, 0, 0, 20, 72, 720], width: 200, height: 20 }, { ascent: 0.8 }, FLIP);
    const box = itemBox(g, 5);
    expect(box.x0).toBeCloseTo(67, 6);
    expect(box.x1).toBeCloseTo(277, 6);
    expect(box.y1).toBeCloseTo(72 + 5, 6);
    expect(box.y0).toBeCloseTo(72 - 20 - 5, 6);
  });

  test("a rotated run is bounded along its own direction", () => {
    const g = itemGeometry({ transform: [0, 20, -20, 0, 100, 300], width: 150, height: 20 }, { ascent: 0.8 }, FLIP);
    const box = itemBox(g, 0);
    expect(box.x0).toBeCloseTo(80, 6);
    expect(box.x1).toBeCloseTo(100, 6);
    expect(box.y0).toBeCloseTo(492 - 150, 6);
    expect(box.y1).toBeCloseTo(492, 6);
  });
});

describe("fitScale", () => {
  test("is the ratio of target to natural width", () => {
    expect(fitScale(90, 100)).toBeCloseTo(0.9, 6);
  });

  test("returns 1 for zero, negative or non-finite widths", () => {
    expect(fitScale(0, 100)).toBe(1);
    expect(fitScale(100, 0)).toBe(1);
    expect(fitScale(-5, 100)).toBe(1);
    expect(fitScale(100, -5)).toBe(1);
    expect(fitScale(Number.NaN, 100)).toBe(1);
    expect(fitScale(100, Number.POSITIVE_INFINITY)).toBe(1);
  });

  test("clamps wild ratios", () => {
    expect(fitScale(1, 1000)).toBe(0.2);
    expect(fitScale(1000, 1)).toBe(5);
  });
});

describe("matchSamples", () => {
  const boxes = [
    { x0: 0, y0: 0, x1: 100, y1: 20 },
    { x0: 0, y0: 40, x1: 100, y1: 60 },
  ];

  test("assigns each sample to the box that contains it", () => {
    const m = matchSamples(boxes, [
      { x: 10, y: 50 },
      { x: 20, y: 10 },
    ]);
    expect(Array.from(m.itemSample)).toEqual([1, 0]);
    expect(m.unmatched).toEqual([]);
  });

  test("reports samples that fall in no box", () => {
    const m = matchSamples(boxes, [
      { x: 10, y: 10 },
      { x: 500, y: 500 },
      { x: 50, y: 30 },
    ]);
    expect(Array.from(m.itemSample)).toEqual([0, -1]);
    expect(m.unmatched).toEqual([1, 2]);
  });

  test("keeps the first sample per box and counts overlaps for every box", () => {
    const overlapping = [
      { x0: 0, y0: 0, x1: 50, y1: 20 },
      { x0: 40, y0: 0, x1: 90, y1: 20 },
    ];
    const m = matchSamples(overlapping, [
      { x: 10, y: 10 },
      { x: 45, y: 10 },
    ]);
    expect(Array.from(m.itemSample)).toEqual([0, 1]);
    expect(m.unmatched).toEqual([]);
  });

  test("handles boxes that span many grid cells and an empty input", () => {
    const wide = [{ x0: -5000, y0: -5000, x1: 5000, y1: 5000 }];
    expect(Array.from(matchSamples(wide, [{ x: 1234, y: -4321 }]).itemSample)).toEqual([0]);
    expect(matchSamples([], []).unmatched).toEqual([]);
  });
});

describe("fixtures", () => {
  const root = join(import.meta.dir, "..", "fixtures");
  test("sample.pdf has a PDF magic header", () => {
    const bytes = readFileSync(join(root, "sample.pdf"));
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
  test("sample.epub is a zip", () => {
    const bytes = readFileSync(join(root, "sample.epub"));
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
