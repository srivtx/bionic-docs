# Changelog

All notable changes to Bionic Docs.

## [Unreleased]

### Changed

- **A new website.** `site/` is redesigned from scratch. The hero shows a
  reader window with a PDF page, chart and zoom bar. The first section is a
  working reader with a contents sidebar, both fixtures, a box for your own
  text, the five modes and intensity. A before/after divider keeps both
  layers on identical lines. Further down: a feature grid, live mode samples,
  how it works with a module map, a privacy band, honest limits, install
  steps and an FAQ. It uses the bundled Geist faces, Docs' teal, and light
  and dark themes. `assets/app.js` replaces `demo.js`. The social card is
  regenerated in teal, and `DESIGN.md`, `tokens.json` and
  `tailwind.theme.json` describe the new design.
- **Intensity works in every mode.** It is now a multiplier that is neutral
  at the default 0.5, as in Bionic Page. Before, it was read only by Classic
  and Low distraction, so moving the slider in the default Half mode did
  nothing. Default settings render exactly as before.

- **PDF pages keep their original layout.** Each page is drawn as the original,
  with its images, diagrams, colors and positions, and the bionic emphasis is
  applied to the text placed over it at its original spot. Pages are drawn
  lazily as they scroll into view. The contents list still shows each page's
  first line. Text uses the browser's own fonts, fitted to the original line
  widths.
- **Fit page, fit width and zoom.** PDF pages open fitted to the window, so a
  whole page is in view. A floating zoom bar steps from 50% to 300% or picks
  Fit page / Fit width; `+`, `−` and `0` do the same from the keyboard. The
  reading spot is kept when zooming, and the choice is remembered. Only the
  page canvas re-renders, so text stays sharp and aligned at every zoom.
- **Designed menus.** The Mode and Zoom menus in the reader, popup and settings
  open a designed, keyboard-accessible list instead of the browser's native
  popup. The native select stays underneath as the source of truth.
- **Its own mark.** The toolbar icon and the wordmarks now use the Bionic Docs
  mark (a page on a teal tile, as on the site) instead of Bionic Page's, and
  the extension pages use Docs' teal accent instead of the shared indigo.

## [0.1.0] — 2026-09-19

First working release.

### Added

- **PDF reading**: locally bundled PDF.js extracts the text layer, lines are
  reconstructed from item transforms, and the result is rendered as a reflowed
  reading column with bionic fixation; page navigation and page count.
- **EPUB reading**: fflate unzips the book locally; `container.xml` → OPF →
  spine and NAV/NCX table of contents; chapters are sanitized (scripts, event
  handlers, and `javascript:` URLs removed) and rendered with fixation;
  chapter navigation and title.
- **Fixation core** shared with the sibling project: five modes (Classic,
  Half, Vowel anchor, Low distraction, Custom rule), unicode and affix
  handling, URL/email/long-run protection.
- Popup and options UI with a live preview, JSON import/export, and reset.
- Background worker for "open current document" and a `Ctrl/Cmd+Shift+O`
  command.
- Manifest V3, generated for Chrome and Firefox from one source.
- Tooling: esbuild build, zero-dependency PNG icons, build verifier, zip
  packager, fixture generator, and a DevTools-protocol e2e that opens real PDF
  and EPUB fixtures in Chrome.
- 92 unit and fixture tests, including an anti-network security scan and an
  accessibility scan of every extension page.

### Known warnings

- `web-ext lint` reports 4 warnings, all from the vendored PDF.js bundle
  (`DANGEROUS_EVAL`, `UNSAFE_VAR_ASSIGNMENT`). PDF.js is constructed with
  `isEvalSupported: false`, so the eval path is not used at runtime; the strings
  are present in the library. There are no errors.
