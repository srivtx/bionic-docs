import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const FILES = tsFiles(SRC).map((path) => ({
  path: path.slice(ROOT.length + 1),
  code: stripComments(readFileSync(path, "utf8")),
}));

const FORBIDDEN: Array<[string, RegExp]> = [
  ["eval", /\beval\s*\(/],
  ["new Function", /new\s+Function\s*\(/],
  ["document.write", /document\.write\s*\(/],
  ["innerHTML assignment", /\.innerHTML\s*=/],
  ["XMLHttpRequest", /XMLHttpRequest/],
  ["WebSocket", /\bWebSocket\b/],
  ["sendBeacon", /sendBeacon/],
  ["remote http(s) literal", /["'`]https?:\/\//],
  ["setTimeout with a string", /setTimeout\s*\(\s*["'`]/],
];

describe("security posture", () => {
  test("there are source files to scan", () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  for (const [name, pattern] of FORBIDDEN) {
    test(`no ${name} in src`, () => {
      const hits = FILES.filter((f) => pattern.test(f.code)).map((f) => f.path);
      expect(hits).toEqual([]);
    });
  }

  test("network fetch is limited to loading the document the user opened", () => {
    const withFetch = FILES.filter((f) => /\bfetch\s*\(/.test(f.code)).map((f) => f.path);
    // reader.ts fetches the ?src= document; nothing else may touch the network.
    expect(withFetch).toEqual(["src/reader/reader.ts"]);
  });

  test("no remote code: scripts are only loaded from extension pages", () => {
    for (const page of ["reader/reader.html", "popup/popup.html", "options/options.html"]) {
      const html = readFileSync(join(SRC, page), "utf8");
      expect(/<script(?![^>]*\ssrc=)/i.test(html)).toBe(false);
      expect(/\son[a-z]+\s*=/i.test(html)).toBe(false);
      expect(html.toLowerCase()).toContain('charset="utf-8"');
    }
  });

  test("the extension declares no remote endpoints", () => {
    const manifest = readFileSync(join(ROOT, "scripts", "manifest.mjs"), "utf8");
    expect(/https?:\/\//.test(stripComments(manifest))).toBe(false);
  });
});
