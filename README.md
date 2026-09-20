<div align="center">

# Bionic Docs

**Read PDF and EPUB with bionic fixation — entirely on-device.**

A Manifest V3 extension for Chrome and Firefox. No upload, no account, no
tracking, no remote code.

[![CI](https://github.com/srivtx/bionic-docs/actions/workflows/ci.yml/badge.svg)](https://github.com/srivtx/bionic-docs/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/srivtx/bionic-docs?sort=semver&color=4f46e5)](https://github.com/srivtx/bionic-docs/releases)
[![license](https://img.shields.io/badge/license-MIT-0f766e)](LICENSE)
[![runtime](https://img.shields.io/badge/runtime-Bun-14151A?logo=bun&logoColor=white)](https://bun.sh)
[![types](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![manifest](https://img.shields.io/badge/Manifest-V3-4f46e5)](scripts/manifest.mjs)
[![tests](https://img.shields.io/badge/tests-92-0f766e)](#testing)
[![e2e](https://img.shields.io/badge/e2e-11%2F11-0f766e)](#testing)
[![on-device](https://img.shields.io/badge/processing-on--device-0f766e)](#privacy)
[![Firefox](https://img.shields.io/badge/Firefox-140%2B-FF7139?logo=firefoxbrowser&logoColor=white)](https://www.mozilla.org/firefox/)
[![Chrome](https://img.shields.io/badge/Chrome-116%2B-4285F4?logo=googlechrome&logoColor=white)](https://www.google.com/chrome/)

</div>

**[Website](https://srivtx.github.io/bionic-docs)** · [Prior art](docs/PRIOR-ART.md) · [Architecture](docs/ARCHITECTURE.md)

---

## Why this exists

The bionic-reading extensions that handle documents send your files to a
server. The local ones do not handle documents. Nobody combines **on-device**,
**no account**, **PDF + EPUB**, and **Chrome + Firefox** in one Manifest V3
build. `docs/PRIOR-ART.md` records the verified comparison (the 100K-user
incumbent posts page text to its own API; the only store product that does
files is cloud, paid, and Chromium-only).

## What it does

- Opens **PDF** files by extracting the text layer with a locally bundled
  PDF.js and reflowing it into a clean reading column with fixation emphasis.
- Opens **EPUB** files by unzipping them locally, reading the spine and table
  of contents, and rendering each chapter with the same emphasis.
- Reuses the fixation algorithm from its sibling, with five modes: Classic,
  Half, Vowel anchor, Low distraction, and a Custom rule.
- Never uploads anything. There is no server, no analytics, and no account.
- Reads files you open in the browser or drag onto the page; local `file://`
  PDFs work when file access is enabled.

## Install

Store listings are pending. For now:

```bash
git clone https://github.com/srivtx/bionic-docs
cd bionic-docs
bun install
bun run build
```

- Chrome / Edge: `chrome://extensions` → Developer mode → Load unpacked →
  `dist/chrome`.
- Firefox: `about:debugging` → This Firefox → Load Temporary Add-on →
  `dist/firefox/manifest.json`.

## Usage

1. Click the toolbar icon and choose **Open current document** (for a PDF open
   in a tab) or **Open a file…**.
2. Pick a mode and adjust intensity in the reader toolbar; changes apply live.
3. Navigate with the ‹ › buttons (pages in a PDF, chapters in an EPUB).
4. Press `Ctrl`/`Cmd`+`Shift`+`O` to open the current document at any time.

## Privacy

Bionic Docs makes **no network requests** for content. The only `fetch` in the
codebase loads the document URL you explicitly opened. Files are parsed in the
extension page; nothing leaves the device. See `SECURITY.md` for the exact
threat model and the anti-network test gate.

## Architecture

```
popup ──(open-current)──▶ background ──▶ reader.html?src=…
reader.html
  ├── pdf/pdf.ts   → PDF.js text extraction → line reconstruction → fixation
  ├── epub/epub.ts → fflate unzip → OPF/spine/TOC → sanitized chapters → fixation
  └── core/*       → pure, tested fixation algorithm (shared lineage)
```

PDF.js and its worker, cmaps, and standard fonts are bundled into the package;
no remote code is loaded at runtime. `docs/CONTRACTS.md` has the exact module
interfaces and `docs/ARCHITECTURE.md` the invariants.

## Development

```bash
bun install
bun run typecheck     # strict, noUnusedLocals
bun test              # unit + fixture tests
bun run make-fixtures # regenerate fixtures/sample.pdf and sample.epub
bun run build         # dist/chrome and dist/firefox
bun run verify        # every manifest-referenced file exists
bun run e2e           # real Chrome: opens the PDF and EPUB fixtures
bun run package       # zip both targets
bun run lint:firefox  # web-ext lint
```

## Testing

| Gate | Result |
|---|---|
| `bun test` | 92 tests across 7 files |
| `bunx tsc --noEmit` | clean (strict TypeScript) |
| build + verify | both targets, 11 referenced entries present each |
| `web-ext lint` | 0 errors (4 warnings from vendored PDF.js) |
| `bun run e2e` | 11/11 in real Chrome — PDF and EPUB, fixation and navigation |

The e2e test serves the built extension pages plus the generated fixtures and
drives real Chrome over the DevTools protocol. It asserts that a PDF becomes a
page of fixation-emphasized lines, that the extracted text is the document, and
that an EPUB renders a chapter, exposes its title, and advances to chapter two.

## Limitations

- **Scanned PDFs** have no text layer; they render as empty pages. OCR is out
  of scope in this version.
- PDFs are shown as **reflowed text**, not the original layout. Complex
  multi-column or design-heavy pages read in extraction order.
- EPUB rendering is intentionally minimal (no pagination, no custom book CSS
  beyond the sanitized chapter markup).
- Firefox floor is 140 because `data_collection_permissions` is only
  understood from that version.

## License

[MIT](LICENSE). Not affiliated with Bionic Reading GmbH.
