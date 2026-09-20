import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assetVersion, stalePages } from "../scripts/stamp-assets.mjs";

const ROOT = join(import.meta.dir, "..");

function idsIn(html: string): Set<string> {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) ids.add(match[1]!);
  return ids;
}

function referencedIds(ts: string): Set<string> {
  const ids = new Set<string>();
  for (const match of ts.matchAll(/(?:\$[A-Za-z]*|getElementById|el<[^>]*>)\(\s*"([^"]+)"\s*\)/g)) ids.add(match[1]!);
  return ids;
}

describe("page wiring", () => {
  for (const page of ["reader", "popup", "options"]) {
    test(`${page}: every referenced element id exists in ${page}.html`, () => {
      const ts = readFileSync(join(ROOT, "src", page, `${page}.ts`), "utf8");
      const html = readFileSync(join(ROOT, "src", page, `${page}.html`), "utf8");
      const present = idsIn(html);
      const referenced = referencedIds(ts);
      const missing = [...referenced].filter((id) => !present.has(id));
      expect(missing).toEqual([]);
      expect(referenced.size).toBeGreaterThan(0);
    });

    test(`${page}.html loads the emitted script and stylesheet`, () => {
      const html = readFileSync(join(ROOT, "src", page, `${page}.html`), "utf8");
      expect(html).toContain(`src="${page}.js"`);
      expect(html).toContain(`href="${page}.css"`);
    });
  }
});

/*
 * The asset version in the site's query strings has to match the assets it
 * names. It was hand-maintained once and never moved while the CSS and JS kept
 * changing, so browsers and the Pages CDN served the old files at the same URL
 * and a round of fixes was invisible to anyone with a warm cache.
 */
describe("site asset stamp", () => {
  const site = join(import.meta.dir, "..", "site");
  const assets = join(site, "assets");

  test("every page references the current assets", () => {
    expect(stalePages(site, assetVersion(assets))).toEqual([]);
  });

  test("the stamp is a content hash", () => {
    expect(assetVersion(assets)).toMatch(/^[0-9a-f]{10}$/);
  });
});
