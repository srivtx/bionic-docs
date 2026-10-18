# Architecture

Bionic Docs reads document files (PDF, EPUB) inside an extension page and
applies the same reversible fixation transform used by its sibling project.

## Module map

```
src/
  shared/     types, cross-browser shim, storage, select.ts/css (the designed
              menu that replaces the native select popup on every page)
  core/       pure fixation algorithm (DOM-free, tested)
  pdf/        lines.ts (pure line reconstruction) + layout.ts (pure page geometry
              and glyph matching) + zoom.ts (pure fit/zoom maths)
              + pdf.ts (PDF.js canvas + text layer)
  epub/       parse.ts (unzip, OPF, TOC, sanitize) + epub.ts (render + fixation)
  reader/     reader.html/css/ts — the document reader page
  popup/      toolbar popup: open a document, quick settings
  options/    full settings, live preview, import/export
  background/ open-current command and message handling
```

## Document flow

```
popup ──open-current──▶ background ──▶ reader.html?src=<url>
reader
  ├─ sniff magic bytes: %PDF → pdf.ts ;  PK → epub.ts
  ├─ pdf.ts:  per page: PDF.js draws a canvas with the glyphs held back,
  │           getTextContent → layout.ts places each run over the canvas
  │           at its original spot → fixation → runs fitted to original width
  │           (lines.ts groupLines only feeds the contents list)
  └─ epub.ts: fflate.unzip → container.xml → OPF (title/spine/nav|ncx)
              → sanitizeChapter → fixation
```

## Invariants

1. **On-device.** The only network call loads the document the user opened.
   `tests/security.test.ts` fails the build if `fetch`, `eval`, `new Function`,
   `document.write`, `innerHTML` assignment, remote URLs, `XMLHttpRequest`, or
   `WebSocket` appear anywhere in `src/` except the single reader `fetch`.
2. **No remote code.** PDF.js, fflate, and the app are bundled; the manifest
   declares no external scripts.
3. **Sanitize before render.** EPUB chapters are sanitized (scripts, handlers,
   remote/`javascript:` URLs removed) before insertion.
4. **Deterministic text.** PDF text is treated as plain text and placed into
   new text nodes; PDF.js runs with `isEvalSupported: false`.
5. **Pure geometry.** `src/pdf/lines.ts`, `src/pdf/layout.ts` and `src/pdf/zoom.ts` have no PDF.js
   or DOM import, so line reconstruction, placement maths and glyph matching
   are unit-tested directly.
5a. **No glyph is lost.** Only the main canvas context is patched to hold back
   `fillText`/`strokeText`; text inside PDF.js scratch canvases, Type 3 and
   pattern-filled text is painted by PDF.js as usual. A held-back glyph that
   matches no text run is replayed onto the canvas, and a run that matched no
   glyph is kept transparent, so nothing is dropped or drawn twice.
6. **One manifest source.** `scripts/manifest.mjs` feeds `build.mjs` and is
   asserted by `tests/manifest.test.ts`.

## Build

```
src/**/*.ts ──esbuild──▶ dist/<target>/{reader,popup,options,background}.js
src/**/*.html,css ─────▶ dist/<target>/*.html,css
assets/icons/*.png ────▶ dist/<target>/icons/
node_modules/pdfjs-dist/{build/pdf.worker.min.mjs,cmaps,standard_fonts}
                       ──▶ dist/<target>/
scripts/manifest.mjs ──▶ dist/<target>/manifest.json
```

`node build.mjs <chrome|firefox|both>`; `--watch` rebuilds on change.
`scripts/verify-build.mjs` asserts every referenced file exists.
