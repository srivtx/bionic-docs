/*
 * Stamp every `assets/<name>?v=...` reference in site/ with a hash of the
 * assets themselves.
 *
 * The site is plain static files, so the only cache-busting lever is the query
 * string. Hand-maintaining that string does not work: it was set once and left
 * alone while the CSS and JS underneath it kept changing, so browsers and the
 * Pages CDN went on serving the old files at the same URL and a whole round of
 * fixes was invisible to anyone with a warm cache. Deriving the stamp from
 * content means the URL changes exactly when the bytes do, and never otherwise.
 *
 * Used by scripts/check-site.mjs and tests/site.test.ts as a gate, and by
 * `bun run stamp` to write the new value.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const REF_RE = /(assets\/[A-Za-z0-9._-]+\.(?:css|js|png|woff2))\?v=[A-Za-z0-9._-]+/g;

/** Every file under a directory, sorted, so the hash is stable. */
function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

/** The stamp for the assets in `assetsDir`: a short content hash. */
export function assetVersion(assetsDir) {
  const hash = createHash("sha256");
  for (const file of filesUnder(assetsDir)) {
    /* The path as well as the bytes, so renaming a file moves the stamp. */
    hash.update(relative(assetsDir, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 10);
}

export function siteDir() {
  return join(fileURLToPath(new URL(".", import.meta.url)), "..", "site");
}

/** Pages still carrying a version other than `version`. */
export function stalePages(site, version) {
  const stale = [];
  for (const name of readdirSync(site).sort()) {
    if (!name.endsWith(".html")) continue;
    const source = readFileSync(join(site, name), "utf8");
    for (const match of source.matchAll(REF_RE)) {
      const found = match[0].slice(match[0].lastIndexOf("?v=") + 3);
      if (found !== version) {
        stale.push(`${name}: ${match[1]}?v=${found} (expected ${version})`);
      }
    }
  }
  return stale;
}

/** Rewrite the query strings. Returns the number of pages changed. */
export function stampPages(site, version) {
  let changed = 0;
  for (const name of readdirSync(site).sort()) {
    if (!name.endsWith(".html")) continue;
    const file = join(site, name);
    const before = readFileSync(file, "utf8");
    const after = before.replace(REF_RE, `$1?v=${version}`);
    if (after !== before) {
      writeFileSync(file, after);
      changed++;
    }
  }
  return changed;
}

function main() {
  const check = process.argv.includes("--check");
  const site = siteDir();
  const version = assetVersion(join(site, "assets"));
  if (check) {
    const stale = stalePages(site, version);
    if (stale.length > 0) {
      for (const line of stale) console.error(`stamp: stale — ${line}`);
      console.error("stamp: run `bun run stamp`");
      process.exit(1);
    }
    console.log(`stamp: OK (${version})`);
    return;
  }
  const changed = stampPages(site, version);
  console.log(`stamp: assets v=${version}, ${changed} page(s) rewritten`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
