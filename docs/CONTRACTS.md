# Module contracts — bionic-docs

`src/shared/types.ts` (copied from bionic-page) is the settings contract.
`src/core/*` is the pure fixation algorithm. Do not edit files you do not own.

## Ownership

| Area | Files | Owner |
|---|---|---|
| EPUB | `src/epub/epub.ts`, `src/epub/parse.ts`, `tests/epub.test.ts` | agent-epub |
| Preferences UI | `src/popup/popup.{html,ts,css}`, `src/options/options.{html,ts,css}` | agent-ui |
| Tests | `tests/core.test.ts`, `tests/manifest.test.ts` | agent-tests |
| PDF + reader + build | everything else | orchestrator |

## Core (frozen)

```ts
// src/core/algorithm.ts
export interface BionicOptions { mode: ModeId; intensity: number; minWordLength: number; skipCommonWords: boolean; rule: string; customVowels: string; }
export function boldLength(word: string, options: BionicOptions): number;
export function emphasize(word: string, options: BionicOptions): { head: string; tail: string } | null;
export function bionicText(text: string, options: BionicOptions): string;
```

## Shared settings

```ts
// src/shared/types.ts
export interface Settings { version: 1; enabled: boolean; mode: ModeId; intensity: number; minWordLength: number; skipCommonWords: boolean; respectExistingBold: boolean; boldWeight: number; restOpacity: number; letterSpacing: boolean; rule: string; customVowels: string; processDynamic: boolean; processIframes: boolean; showFloatingControl: boolean; sites: SiteRule[]; }
export const DEFAULT_SETTINGS: Settings;
export function sanitizeSettings(input: Partial<Settings> | null | undefined): Settings;
export const MODES: readonly { id: ModeId; label: string; description: string }[];
```

## EPUB contract (`src/epub/`)

```ts
// epub.ts
import type { BionicOptions } from "../core/algorithm";
export interface EpubTocEntry { id: string; label: string; depth: number }
export interface EpubHandle {
  title: string;
  toc: EpubTocEntry[];
  chapterCount: number;
  currentIndex(): number;
  goToIndex(index: number): void;
  setOptions(options: BionicOptions): void;
  destroy(): void;
}
export async function openEpub(data: ArrayBuffer, container: HTMLElement, options: BionicOptions): Promise<EpubHandle>;

// parse.ts (pure, testable without a DOM where possible)
export function unzipEpub(data: ArrayBuffer): Record<string, Uint8Array>;      // fflate.unzipSync wrapper
export function findOpfPath(files: Record<string, Uint8Array>): string;         // via META-INF/container.xml
export function decodeText(bytes: Uint8Array): string;                          // UTF-8
export function sanitizeChapter(html: string, doc: Document): Document;         // strip script/style/iframe/on* and remote src/href=javascript:
```

Requirements:
- Unzip with `fflate` (already a dependency). No network.
- Parse `META-INF/container.xml` → OPF path; parse OPF for title, manifest,
  spine order, and the NAV/NCX table of contents (whichever exists).
- Sanitize each chapter before inserting it into the live document.
- Apply fixation to chapter text using `emphasize` from `../core/algorithm`:
  wrap `head` in `<b class="bp-head">`, keep `tail` as text. Skip
  `script/style/code/pre/kbd/samp/textarea` and `[data-bionic="off"]`.
  Track processed text nodes in a `WeakSet` so re-applying is idempotent.
- `setOptions` re-renders the current chapter with the new options (remove the
  old wrappers first).
- All DOM work wrapped so it never throws into the page.

## Preferences UI contract (`src/popup/`, `src/options/`)

Popup (≤340px): wordmark, master enable switch, mode `<select>`, intensity
slider, min word length, a button "Open current document" that asks the
background/reader to open the active tab (send `{type:"open-current"}` to the
background via `chrome.runtime.sendMessage`; if unavailable, open
`reader.html`), a button "Open a file…" that opens `reader.html?pick=1`, and a
link to Options. Keyboard accessible, light+dark.

Options: full `Settings` form (all fields), live preview paragraph using
`emphasize`, reset, and JSON import/export. Persist with `saveSettings` from
`../shared/storage`.

Both pages must guard every `getElementById` and never throw outside an
extension context (they are rendered in tests and screenshots).

## Tests contract

- `tests/core.test.ts`: adapt bionic-page's algorithm tests (fixation rules,
  unicode, affixes, unbreakable tokens, rule parsing, settings clamping).
- `tests/manifest.test.ts`: assert both generated manifests (Chrome has no
  `browser_specific_settings`, Firefox has the gecko id and
  `data_collection_permissions: {required:["none"]}`, both MV3, permissions
  minimal, command present).
