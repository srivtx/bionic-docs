# Changelog

All notable changes to Bionic Docs.

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
