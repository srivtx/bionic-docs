import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";

const ROOT = join(import.meta.dir, "..");
const PAGES = ["reader/reader.html", "popup/popup.html", "options/options.html"];

function parse(source: string): Document {
  return parseHTML(source).document as unknown as Document;
}

describe("accessibility of extension pages", () => {
  for (const page of PAGES) {
    const html = readFileSync(join(ROOT, "src", page), "utf8");

    test(`${page}: every form control is labelled`, () => {
      const doc = parse(html);
      const unlabelled: string[] = [];
      for (const control of doc.querySelectorAll("input, select, textarea")) {
        const id = control.getAttribute("id");
        const aria = control.getAttribute("aria-label");
        const wrapping = control.closest("label");
        const label = id ? doc.querySelector(`label[for="${id}"]`) : null;
        if (!aria && !wrapping && !label) unlabelled.push(`${control.tagName.toLowerCase()}#${id ?? "?"}`);
      }
      expect(unlabelled).toEqual([]);
    });

    test(`${page}: every button has an accessible name`, () => {
      const doc = parse(html);
      const nameless: string[] = [];
      for (const button of doc.querySelectorAll("button")) {
        const text = (button.textContent ?? "").trim();
        const aria = button.getAttribute("aria-label");
        if (!text && !aria) nameless.push(button.getAttribute("id") ?? "?");
      }
      expect(nameless).toEqual([]);
    });

    test(`${page}: images have alt text`, () => {
      const doc = parse(html);
      const missing: string[] = [];
      for (const img of doc.querySelectorAll("img")) {
        if (img.getAttribute("alt") === null) missing.push(img.getAttribute("src") ?? "?");
      }
      expect(missing).toEqual([]);
    });
  }
});
