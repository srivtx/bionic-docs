# Architecture

Bionic Docs reads document files (PDF, EPUB) inside an extension page and
applies the same reversible fixation transform used by its sibling project.

## Module map

```
src/
  shared/     types, cross-browser shim, storage (no document parsing)
  core/       pure fixation algorithm (DOM-free, tested)
  pdf/        lines.ts (pure line reconstruction) + pdf.ts (PDF.js + render)
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
  ├─ pdf.ts:  PDF.js getTextContent → lines.ts groupLines → fixation
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
5. **Pure line reconstruction.** `src/pdf/lines.ts` has no PDF.js import, so it
   is unit-tested directly.
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
