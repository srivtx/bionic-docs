## What changed

<!-- One or two sentences. Link any issue. -->

## Checklist

- [ ] `bunx tsc --noEmit` is clean
- [ ] `bun test` passes (new behavior has a test)
- [ ] `bun run build` and `node scripts/verify-build.mjs` pass
- [ ] `bunx web-ext lint --source-dir dist/firefox` reports no errors
- [ ] Any DOM change is reversible and idempotent
- [ ] No network code, no new runtime dependencies
- [ ] User-visible surfaces follow `docs/BRAND.md`

## Notes for reviewers

<!-- Trade-offs, screenshots, or anything not obvious from the diff. -->
