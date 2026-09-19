# Security

## Supported versions

The latest release on `main`.

## Threat model

Bionic Docs parses untrusted documents (PDF, EPUB) inside an extension page and
never runs code from them.

### What it does not do

- No remote code. PDF.js, fflate, and all application code are bundled in the
  package; nothing is fetched and evaluated at runtime.
- **No content leaves the device.** There is no server. The only `fetch` in the
  codebase is the reader loading the document URL the user explicitly opened.
- No analytics, no telemetry, no accounts.
- No `declarativeNetRequest`, `webRequest`, cookies, history, or downloads.

### Permissions

| Permission | Why |
|---|---|
| `storage` | Save the reading settings |
| `activeTab` | Read the active tab's URL to open a PDF in the reader |
| `<all_urls>` (host) | Fetch the document the user opened (extensions need host access to read a cross-origin file) |

### Document handling

- EPUB chapters are sanitized before insertion: `script`, `style`, `iframe`,
  `object`, `embed`, `link`, `meta`, `base`, all `on*` attributes, and
  `javascript:` URLs are removed.
- PDF text is treated as plain text and placed into new text nodes; PDF content
  streams are never executed.
- PDF.js is constructed with `isEvalSupported: false`.

### Known lint warnings

`web-ext lint` reports `DANGEROUS_EVAL` and `UNSAFE_VAR_ASSIGNMENT` warnings
that originate in the vendored PDF.js bundle. The eval path is disabled at
runtime (`isEvalSupported: false`). `bun test` includes a source scan that
fails if `eval`, `new Function`, `document.write`, `innerHTML` assignment,
remote URLs, or network calls appear in our own `src/`.

## Reporting

Open a private security advisory on the repository (`Security` →
`Report a vulnerability`). Include a minimal reproduction and the browser
version.

## Verifying a build

```bash
bun install
bun test
bun run build
node scripts/verify-build.mjs
bunx web-ext lint --source-dir dist/firefox
```
