#!/usr/bin/env bun
/**
 * Generate the test fixtures used by the browser e2e and by manual checks:
 *   fixtures/sample.pdf   a minimal, valid one-page PDF with real text
 *   fixtures/sample.epub  a minimal valid EPUB with two chapters
 *
 * Everything is built in memory here; no external tools or network.
 */
import { strToU8, zipSync } from "fflate";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(ROOT, "fixtures");
mkdirSync(FIX, { recursive: true });

function buildPdf(): Uint8Array {
  const lines = [
    "Bionic reading works in PDF documents",
    "The leading letters of every word are emphasized",
    "and the rest of the word is left alone.",
  ];
  let content = "BT /F1 20 Tf 72 720 Td 26 TL\n";
  for (const line of lines) content += `(${line}) Tj T*\n`;
  content += "ET";

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  );
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return strToU8(pdf);
}

function buildEpub(): Uint8Array {
  const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Bionic Docs Sample</dc:title>
    <dc:identifier id="bookid">urn:uuid:bionic-docs-sample</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`;

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol>
  <li><a href="chapter1.xhtml">Chapter One</a></li>
  <li><a href="chapter2.xhtml">Chapter Two</a></li>
</ol></nav></body></html>`;

  const chapter = (title: string, body: string): string => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title></head>
<body><h1>${title}</h1><p>${body}</p><p>The leading letters of each word carry the emphasis.</p></body></html>`;

  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": [strToU8(container), { level: 6 }],
    "OEBPS/content.opf": [strToU8(opf), { level: 6 }],
    "OEBPS/nav.xhtml": [strToU8(nav), { level: 6 }],
    "OEBPS/chapter1.xhtml": [
      strToU8(chapter("Chapter One", "Bionic reading works in EPUB documents too.")),
      { level: 6 },
    ],
    "OEBPS/chapter2.xhtml": [
      strToU8(chapter("Chapter Two", "Chapters are reflowed and emphasized locally.")),
      { level: 6 },
    ],
  };
  return zipSync(files as never);
}

const pdf = buildPdf();
const epub = buildEpub();
writeFileSync(join(FIX, "sample.pdf"), pdf);
writeFileSync(join(FIX, "sample.epub"), epub);
console.log(`wrote fixtures/sample.pdf (${pdf.length} bytes)`);
console.log(`wrote fixtures/sample.epub (${epub.length} bytes)`);
