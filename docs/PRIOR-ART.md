# Prior art and the verified gap

Researched and verified 2026-09-19. This file is the reason the project exists;
if a competitor closes the gap, update this file and reconsider.

## The clause nobody satisfies

> Applies bionic-style fixation emphasis to the text of **PDF and EPUB**
> documents **entirely on-device** — no upload, no remote API, no account — in
> a single **Manifest V3** extension shipped for **Chrome and Firefox**.

Every existing product fails at least one qualifier.

## Verified competitors

| Product | What it does | Why it fails the clause |
|---|---|---|
| **Bionic Reading** (official Chrome extension, 100K users, v5.0.2) | Bionic emphasis on web pages | Sends the extracted article text to `api.reader.bionic-reading.com` (verified by an independent extension audit, 2026-08-28); no PDF/EPUB; 2.4–2.5★ |
| **Nook — Focused Reading** | Bionic/RSVP on PDF/EPUB/DOCX/web | Cloud + subscription, Chrome/Edge only, ~289 users |
| **ReadClear (Read Aloud — Dyslexia Font, Bionic Reading)** | Bionic + PDF | Calls `clearread-api-production.up.railway.app`, Chrome-only, ~251 users |
| **Readit Fast** | PDF/EPUB speed reading | PDF support gated behind account sign-in |
| **FastRead** | PDF/EPUB → bionic | Web app; documents are uploaded, not read locally in the browser |
| **Readability Reader** (`ldenoue/readability-read-aloud-web-pdf-ai-summary`) | Local PDF.js reading view, MV3, Chrome+Firefox | No fixation emphasis |
| **webextension.org PDF Reader** | Replaces the PDF viewer with local PDF.js | No fixation emphasis |
| **Bionic for Zotero** (`windingwind/bionic-for-zotero`) | Fixation glyphs inside Zotero's PDF.js | Native Zotero only, not a browser extension |
| **Bionic Reader** (Rain Jr., Firefox) | Web-page bionic | No PDF/EPUB |
| Local accountless bionic web extensions (LucidRead, Elu, FocusFlow, and our own **bionic-page**) | Web articles | No PDF/EPUB |

The idea of "bionic PDFs" is well-trodden (Hugging Face Spaces, Python
content-stream tools), but the **local, in-browser, cross-browser packaging**
is unclaimed.

## Why it is possible under MV3

- Chrome's built-in PDF viewer is a privileged internal component; an MV3
  content script cannot inject into it. The workable architecture — used by
  every credible competitor — is to bundle **PDF.js locally** and present the
  document in the extension's own reading view.
- PDF.js and fflate are ordinary local JavaScript; bundling them satisfies
  MV3's "no remote code" rule.
- Text positioning comes from `page.getTextContent()` item transforms, which is
  exactly what Bionic-for-Zotero patches.

## Threat to the thesis

If the official Bionic Reading extension adds local PDF/EPUB, or a local
cross-browser reader adds fixation, this gap closes. Re-check the rows above
before shipping a store listing.
