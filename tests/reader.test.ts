/**
 * Tests for the reader's pure helpers: contents shaping, reading-position
 * keying/eviction and the keyboard-intent decision. None of these touch the
 * DOM or the extension storage, which is why they can be pinned here.
 */

import { describe, expect, test } from "bun:test";

import { navIntent, isTypingTarget } from "../src/reader/keys";
import {
  MAX_REMEMBERED,
  hashBytes,
  positionKey,
  recallPosition,
  rememberPosition,
  sanitizePositionStore,
} from "../src/reader/positions";
import type { PositionStore } from "../src/reader/positions";
import { epubTocEntries, matchChapter, pdfTocEntries, truncateLabel } from "../src/reader/toc";

describe("truncateLabel", () => {
  test("collapses whitespace and trims", () => {
    expect(truncateLabel("  Chapter   One\n\nIntroduction  ")).toBe("Chapter One Introduction");
  });

  test("drops control characters", () => {
    expect(truncateLabel("A\u0000B\u001fC")).toBe("A B C");
  });

  test("returns short labels unchanged", () => {
    expect(truncateLabel("Preface", 40)).toBe("Preface");
  });

  test("truncates on a word boundary and stays within the budget", () => {
    const out = truncateLabel("The quick brown fox jumps over the lazy dog", 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("\u2026")).toBe(true);
    expect(out).not.toContain("  ");
    expect("The quick brown fox jumps over the lazy dog".startsWith(out.slice(0, -1))).toBe(true);
  });

  test("hard-cuts a long unbroken token", () => {
    const out = truncateLabel("supercalifragilisticexpialidocious", 10);
    expect(out).toBe("supercali\u2026");
    expect(out.length).toBe(10);
  });

  test("handles tiny and empty budgets", () => {
    expect(truncateLabel("hello", 1)).toBe("h");
    expect(truncateLabel("hello", 0)).toBe("");
    expect(truncateLabel("", 20)).toBe("");
  });
});

describe("pdfTocEntries", () => {
  test("makes one entry per page with a page marker and zero-based target", () => {
    const items = pdfTocEntries([
      { page: 1, firstLine: "Introduction" },
      { page: 2, firstLine: "Methods" },
    ]);
    expect(items.map((i) => i.marker)).toEqual(["1", "2"]);
    expect(items.map((i) => i.target)).toEqual([0, 1]);
    expect(items[0]?.label).toBe("Introduction");
    expect(items[0]?.depth).toBe(0);
  });

  test("labels a text-less page explicitly", () => {
    const items = pdfTocEntries([{ page: 7, firstLine: "" }]);
    expect(items[0]?.label).toBe("(no extractable text)");
    expect(items[0]?.marker).toBe("7");
    expect(items[0]?.target).toBe(6);
  });

  test("truncates long first lines", () => {
    const items = pdfTocEntries([{ page: 1, firstLine: "word ".repeat(50) }], 24);
    expect(items[0]!.label.length).toBeLessThanOrEqual(24);
  });
});

describe("matchChapter", () => {
  const paths = ["OEBPS/Text/chapter1.xhtml", "OEBPS/Text/chapter2.xhtml"];

  test("matches a resolved path exactly", () => {
    expect(matchChapter(paths, "OEBPS/Text/chapter2.xhtml")).toBe(1);
  });

  test("matches case-insensitively and without a leading ./", () => {
    expect(matchChapter(paths, "./oebps/text/CHAPTER1.XHTML")).toBe(0);
  });

  test("falls back to a basename match", () => {
    expect(matchChapter(paths, "chapter2.xhtml")).toBe(1);
  });

  test("returns null for fragment-only ids and empty input", () => {
    expect(matchChapter(paths, "section-3")).toBeNull();
    expect(matchChapter(paths, "")).toBeNull();
  });
});

describe("epubTocEntries", () => {
  test("trusts order when the TOC and spine line up", () => {
    const items = epubTocEntries(
      [
        { id: "a", label: "One", depth: 0 },
        { id: "b", label: "Two", depth: 0 },
      ],
      ["OEBPS/a.xhtml", "OEBPS/b.xhtml"],
    );
    expect(items.map((i) => i.target)).toEqual([0, 1]);
  });

  test("maps by path and lets fragment entries inherit the parent chapter", () => {
    const items = epubTocEntries(
      [
        { id: "OEBPS/a.xhtml", label: "Part One", depth: 0 },
        { id: "section-1", label: "A detail", depth: 1 },
        { id: "OEBPS/b.xhtml", label: "Part Two", depth: 0 },
      ],
      ["OEBPS/a.xhtml", "OEBPS/b.xhtml", "OEBPS/c.xhtml", "OEBPS/d.xhtml"],
    );
    expect(items.map((i) => i.target)).toEqual([0, 0, 1]);
    expect(items.map((i) => i.depth)).toEqual([0, 1, 0]);
  });

  test("drops unlabelled entries and clamps targets into range", () => {
    const items = epubTocEntries(
      [
        { id: "x", label: "   ", depth: 0 },
        { id: "missing.xhtml", label: "Far away", depth: 0 },
      ],
      ["OEBPS/a.xhtml"],
    );
    expect(items.length).toBe(1);
    expect(items[0]?.label).toBe("Far away");
    expect(items[0]?.target).toBe(0);
  });

  test("empty chapter list still yields labelled entries", () => {
    const items = epubTocEntries([{ id: "a", label: "Cover", depth: 0 }], []);
    expect(items).toEqual([{ target: 0, label: "Cover", depth: 0, marker: "" }]);
  });
});

describe("position identity", () => {
  test("hashBytes is deterministic", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    expect(hashBytes(bytes)).toBe(hashBytes(new Uint8Array([1, 2, 3, 4, 5])));
  });

  test("hashBytes changes with content", () => {
    expect(hashBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashBytes(new Uint8Array([1, 2, 4])));
  });

  test("positionKey encodes kind, length and hash", () => {
    const key = positionKey("pdf", new Uint8Array([9, 9, 9]));
    expect(key.startsWith("pdf:3:")).toBe(true);
    expect(positionKey("epub", new Uint8Array([9, 9, 9]))).not.toBe(key);
  });
});

describe("position store", () => {
  const at = (n: number) => ({ kind: "pdf" as const, index: n, at: n });

  test("remembers and recalls a position", () => {
    const store = rememberPosition({}, "doc-a", at(4));
    expect(recallPosition(store, "doc-a")).toEqual(at(4));
    expect(recallPosition(store, "missing")).toBeNull();
  });

  test("updates in place rather than duplicating", () => {
    let store: PositionStore = rememberPosition({}, "doc-a", at(1));
    store = rememberPosition(store, "doc-a", at(9));
    expect(Object.keys(store).length).toBe(1);
    expect(store["doc-a"]?.index).toBe(9);
  });

  test("evicts the oldest when over the cap", () => {
    let store: PositionStore = {};
    for (let i = 1; i <= 4; i += 1) store = rememberPosition(store, `doc-${i}`, at(i), 3);
    expect(Object.keys(store).sort()).toEqual(["doc-2", "doc-3", "doc-4"]);
  });

  test("respects the default cap", () => {
    let store: PositionStore = {};
    for (let i = 0; i < MAX_REMEMBERED + 5; i += 1) store = rememberPosition(store, `k${i}`, at(i));
    expect(Object.keys(store).length).toBe(MAX_REMEMBERED);
  });

  test("sanitizes an untrusted store, dropping bad records and capping", () => {
    const clean = sanitizePositionStore(
      {
        good: { kind: "epub", index: 2, at: 10 },
        older: { kind: "pdf", index: 1, at: 1 },
        negative: { kind: "pdf", index: -3, at: 5 },
        wrongKind: { kind: "docx", index: 0, at: 6 },
        notObject: 7,
      },
      2,
    );
    expect(Object.keys(clean).sort()).toEqual(["good", "older"]);
    expect(clean["good"]).toEqual({ kind: "epub", index: 2, at: 10 });
  });

  test("returns an empty store for non-objects", () => {
    expect(sanitizePositionStore(null)).toEqual({});
    expect(sanitizePositionStore("nope")).toEqual({});
  });
});

describe("isTypingTarget", () => {
  test("protects inputs, textareas, selects and contenteditable", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "textarea" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  test("treats focus inside the contents panel as interactive", () => {
    expect(isTypingTarget({ tagName: "BUTTON", inContentsPanel: true })).toBe(true);
  });
});

describe("navIntent", () => {
  const noFocus = { tagName: "BODY" };

  test("maps next/prev keys", () => {
    expect(navIntent({ key: "ArrowRight" }, noFocus, false)).toBe("next");
    expect(navIntent({ key: "PageDown" }, noFocus, false)).toBe("next");
    expect(navIntent({ key: "ArrowLeft" }, noFocus, false)).toBe("prev");
    expect(navIntent({ key: "PageUp" }, noFocus, false)).toBe("prev");
  });

  test("maps Home/End to first/last", () => {
    expect(navIntent({ key: "Home" }, noFocus, false)).toBe("first");
    expect(navIntent({ key: "End" }, noFocus, false)).toBe("last");
  });

  test("maps C to the contents toggle, case-insensitively", () => {
    expect(navIntent({ key: "c" }, noFocus, false)).toBe("toggle-toc");
    expect(navIntent({ key: "C" }, noFocus, false)).toBe("toggle-toc");
  });

  test("ignores ctrl, meta and alt combinations", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(navIntent({ key: "ArrowRight", [mod]: true }, noFocus, false)).toBeNull();
      expect(navIntent({ key: "c", [mod]: true }, noFocus, false)).toBeNull();
    }
  });

  test("allows shift as the only modifier", () => {
    expect(navIntent({ key: "ArrowRight", shiftKey: true }, noFocus, false)).toBe("next");
  });

  test("ignores keystrokes in a typing target", () => {
    expect(navIntent({ key: "ArrowRight" }, { tagName: "INPUT" }, false)).toBeNull();
    expect(navIntent({ key: "End" }, { tagName: "TEXTAREA" }, false)).toBeNull();
    expect(navIntent({ key: "Home" }, { tagName: "DIV", isContentEditable: true }, false)).toBeNull();
    expect(navIntent({ key: "c" }, { tagName: "BUTTON", inContentsPanel: true }, false)).toBeNull();
  });

  test("ignores consumed and composing events", () => {
    expect(navIntent({ key: "ArrowRight", defaultPrevented: true }, noFocus, false)).toBeNull();
    expect(navIntent({ key: "ArrowRight", isComposing: true }, noFocus, false)).toBeNull();
    expect(navIntent(null, noFocus, false)).toBeNull();
  });

  test("Escape closes the contents panel only when it is open", () => {
    expect(navIntent({ key: "Escape" }, noFocus, true)).toBe("close-toc");
    expect(navIntent({ key: "Escape" }, noFocus, false)).toBeNull();
  });

  test("leaves unrelated keys alone", () => {
    expect(navIntent({ key: "a" }, noFocus, false)).toBeNull();
    expect(navIntent({ key: "Tab" }, noFocus, false)).toBeNull();
    expect(navIntent({ key: " " }, noFocus, false)).toBeNull();
  });
});
