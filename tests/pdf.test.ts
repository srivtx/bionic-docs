import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { groupLines, type PdfTextItem } from "../src/pdf/lines";

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
