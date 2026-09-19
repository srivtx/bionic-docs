import { expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { DOMParser as LinkedomDOMParser, parseHTML } from "linkedom";

import type { BionicOptions } from "../src/core/algorithm";
import { openEpub } from "../src/epub/epub";
import { findOpfPath, sanitizeChapter, unzipEpub } from "../src/epub/parse";

(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser =
  LinkedomDOMParser as unknown as typeof DOMParser;

const OPTIONS: BionicOptions = {
  mode: "half",
  intensity: 0.5,
  minWordLength: 3,
  skipCommonWords: false,
  rule: "0 1 1 2 0.4",
  customVowels: "",
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function buildEpub(): Uint8Array {
  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>The Tiny Book</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <ol>
        <li><a href="chapter1.xhtml">Chapter One</a></li>
        <li><a href="chapter2.xhtml">Chapter Two</a></li>
      </ol>
    </nav>
  </body>
</html>`;

  const chapter1 = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title></head><body><p>Hello bionic reading works beautifully</p></body></html>`;
  const chapter2 = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Two</title></head><body><p>Second chapter metamorphosis</p></body></html>`;

  return zipSync({
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(container),
    "OEBPS/content.opf": strToU8(opf),
    "OEBPS/nav.xhtml": strToU8(nav),
    "OEBPS/chapter1.xhtml": strToU8(chapter1),
    "OEBPS/chapter2.xhtml": strToU8(chapter2),
  });
}

function makeContainer(): HTMLElement {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document.body as unknown as HTMLElement;
}

test("unzipEpub + findOpfPath locate the package document", () => {
  const files = unzipEpub(toArrayBuffer(buildEpub()));
  expect(files["META-INF/container.xml"]).toBeInstanceOf(Uint8Array);
  expect(findOpfPath(files)).toBe("OEBPS/content.opf");
});

test("openEpub parses metadata, spine and TOC and renders the first chapter", async () => {
  const container = makeContainer();
  const handle = await openEpub(toArrayBuffer(buildEpub()), container, OPTIONS);

  expect(handle.title).toBe("The Tiny Book");
  expect(handle.chapterCount).toBe(2);
  expect(handle.toc.length).toBeGreaterThanOrEqual(2);
  expect(handle.currentIndex()).toBe(0);
  expect(container.textContent).toContain("Hello bionic");
  expect(container.querySelector("b.bp-head")).not.toBeNull();
});

test("setOptions reverts the old wrappers and re-renders with new emphasis", async () => {
  const container = makeContainer();
  const handle = await openEpub(
    toArrayBuffer(buildEpub()),
    container,
    { ...OPTIONS, mode: "half", intensity: 0.2 },
  );

  const before = container.innerHTML;
  const beforeHeads = container.querySelectorAll("b.bp-head").length;
  expect(beforeHeads).toBeGreaterThan(0);

  handle.setOptions({ ...OPTIONS, mode: "classic", intensity: 0.9 });
  const after = container.innerHTML;
  expect(after).not.toBe(before);
  expect(container.querySelector("b.bp-head")).not.toBeNull();

  handle.destroy();
  expect(container.childNodes.length).toBe(0);
});

test("sanitizeChapter strips scripts, handlers and javascript: URLs", () => {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const clean = sanitizeChapter(
    '<html><body><p onclick="evil()">Hi</p><script>bad()</script><a href="javascript:alert(1)">x</a></body></html>',
    document,
  );

  expect(clean.querySelector("script")).toBeNull();
  expect(clean.querySelector("p")?.getAttribute("onclick")).toBeNull();
  expect(clean.querySelector("a")?.getAttribute("href")).toBeNull();
  expect(clean.body?.textContent).toContain("Hi");
});
