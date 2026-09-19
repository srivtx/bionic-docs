# Contributing

Thanks for considering a contribution. This project is a small, dependency-light
browser extension; the goal is to keep it correct, private, and reversible.

## Setup

```bash
bun install
bun run build      # dist/chrome and dist/firefox
```

Load `dist/chrome` at `chrome://extensions` (Developer mode → Load unpacked) and
`dist/firefox` at `about:debugging` → This Firefox → Load Temporary Add-on.

## Before you open a PR

```bash
bunx tsc --noEmit          # strict, must be clean
bun test                   # unit + real-DOM tests
bun run build
node scripts/verify-build.mjs
bun run e2e                # needs a local Chrome
bunx web-ext lint --source-dir dist/firefox
```

All of these must pass. CI runs the first four on every push.

## Ground rules

1. `src/core/*` stays pure: no DOM, timers, randomness, or network.
2. Every DOM change must be **reversible** and **idempotent**; add a test.
3. Never bypass `src/content/guards.ts` for exclusions.
4. No new runtime dependencies. A dev/test dependency needs a reason.
5. No network code. `tests/security.test.ts` will fail the build if you add
   `fetch`, `XMLHttpRequest`, `WebSocket`, remote URLs, `eval`, `new Function`,
   or `innerHTML` assignment.
6. Follow `docs/BRAND.md` for any user-visible surface.
7. Keep the manifest honest: `scripts/manifest.mjs` is the only source, and the
   two engines are generated from it.

## Adding a reading mode

1. Add the id to `ModeId` and an entry to `MODES` in `src/shared/types.ts`.
2. Implement the branch in `src/core/algorithm.ts` and add algorithm tests.
3. Style it in `src/content/styles.ts` if it needs CSS.
4. Update the site mode table in `site/index.html` and `site/how-to.html`.

## Style

- TypeScript strict, no `any` in new public APIs.
- Match the surrounding style; keep functions small and defensive.
- Write commit messages in the imperative mood ("fix: …", "feat: …", "docs: …").

## Reporting bugs

Include the browser and version, the site (if shareable), the mode, and whether
toggling off restores the page. A reduced reproduction is ideal.
