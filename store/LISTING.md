# Store listing — Bionic Docs

## Identity

- **Name:** Bionic Docs
- **Summary (132-character limit):** Read PDF and EPUB with bionic fixation, entirely on-device. No upload, no account, no tracking, no remote code.
  - **Character count: 111 / 132.** (Also within Firefox Add-ons' 250-character limit.)
- **Category:** Productivity (Chrome Web Store) · Accessibility (Firefox Add-ons)
- **Language:** English
- **Homepage:** `site/index.html` → https://srivtx.github.io/bionic-docs/
- **Privacy policy:** `site/privacy.html` → https://srivtx.github.io/bionic-docs/privacy.html

## Full description

Bionic Docs is a Manifest V3 extension for Chrome and Firefox that reads PDF and
EPUB documents with bionic fixation emphasis, entirely on the device. There is
no upload, no account, no tracking, and no remote code.

It opens PDFs by extracting the text layer with a locally bundled PDF.js and
reflowing it into a clean reading column. It opens EPUBs by unzipping them
locally, reading the spine and table of contents, and rendering each chapter. A
document opened in the browser can be sent to the reader from the toolbar, and a
PDF or EPUB can be dropped onto the reader page.

The reading style reuses the fixation algorithm from its sibling extension, with
the same five modes: Classic, Half, Vowel anchor, Low distraction, and a Custom
rule. Mode and intensity are adjustable in the reader toolbar and apply live;
pages or chapters are navigated with the previous and next buttons.

Processing is local. The only `fetch` in the codebase loads the document URL the
user explicitly opened; nothing is uploaded, and there is no server, analytics,
or account. The extension does not request `declarativeNetRequest`, `webRequest`,
cookies, history, or downloads.

Scanned PDFs have no text layer and render as empty pages; OCR is out of scope in
this version. PDFs are shown as reflowed text rather than their original layout,
and EPUB rendering is intentionally minimal. Local `file://` PDFs work when file
access is enabled in the browser. The project is MIT-licensed and open source.

## Single purpose

Open and read the user's PDF and EPUB documents with a configurable bionic
reading style, entirely on the device.

## Permission justifications

The manifest requests exactly `storage`, `activeTab`, and the `<all_urls>` host
permission (`dist/chrome/manifest.json`).

- **`storage`** — Saves the reading settings (enable state, mode, intensity,
  minimum word length, appearance options, and custom rules) in the browser's
  own extension storage. Nothing stored is transmitted.
- **`activeTab`** — Reads the active tab's URL so the user can send a document
  they are already viewing to the reader, after a user gesture, without broad
  tab access.
- **`host_permissions: <all_urls>`** — The reader loads the document the user
  explicitly opened, and extensions need host access to read a cross-origin
  file. The permission also lets the built-in PDF.js worker, cmaps, and standard
  fonts be served as web-accessible resources for the reader page
  (`web_accessible_resources`). Only that user-chosen document URL is fetched;
  no document content or page data is transmitted, stored, or logged.
- **Remote code** — None. PDF.js, fflate, and all application code are bundled
  in the package; nothing is fetched and evaluated at runtime. PDF.js is
  constructed with `isEvalSupported: false`. EPUB chapters are sanitized before
  insertion (script, style, iframe, object, embed, link, meta, base, all `on*`
  attributes, and `javascript:` URLs are removed).

## Data-usage declaration

- Data collected: **None.**
- Personally identifiable information: **No**
- Health information: **No**
- Financial and payment information: **No**
- Authentication information: **No**
- Personal communications: **No**
- Location: **No**
- Web history: **No**
- User activity: **No**
- Website content: **No**
- Sold or transferred to third parties: **No**
- Used or transferred for purposes unrelated to the single purpose: **No**
- Used or transferred to determine creditworthiness or for lending: **No**

All three certification statements in the Chrome Web Store data-usage form can
be affirmed. Documents are parsed inside the extension page and never leave the
device; the only network read is the document URL the user chose to open. This is
checkable in the source: `SECURITY.md` states the threat model, and `bun test`
runs a source scan that fails if `eval`, `new Function`, `document.write`,
`innerHTML` assignment, remote URLs, or network calls appear in the project's own
`src/`.

## Non-affiliation

"Bionic Reading" is a trademark of Bionic Reading GmbH; this project is not
affiliated with or endorsed by it.

## Still missing before submission

- Host the homepage and privacy policy and paste both URLs into the listing
  (`site/index.html`, `site/privacy.html`).
- A Chrome Web Store developer account with a verified contact email and
  2-step verification enabled.
- Upload `store/screenshots/01-pdf-reader.png`, `02-epub-reader.png`,
  `03-options.png`, `04-popup.png` (all 1280×800) and
  `store/promo/tile-440x280.png`. No 1400×560 marquee was produced for this
  extension; it is optional.
- Upload the packaged build `dist/bionic-docs-chrome-0.1.0.zip` (rebuild with
  `bun run package` if the source changes).
- Firefox Add-ons: confirm the gecko id (`bionic-docs@srivtx.github.io`) and the
  `data_collection_permissions: ["none"]` declaration, then attach
  `dist/bionic-docs-firefox-0.1.0.zip`. Expect `web-ext` warnings from the
  vendored PDF.js bundle; the eval path is disabled at runtime.
- Keep the scanned-PDF limitation disclosed in the listing (it is already in the
  description above).
