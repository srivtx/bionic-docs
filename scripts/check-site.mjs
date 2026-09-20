import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Static-site checker for the bionic sites.
 *
 * The site ships as plain files to GitHub Pages, so there is no build step to
 * catch mistakes. This script is the safety net: it runs from the repo root
 * (`node scripts/check-site.mjs`), reads every site/*.html, and reports the
 * things that would break the published site — unknown classes, dangling
 * internal links, accidental network requests, inline styles, missing social
 * head tags, and missing shared assets.
 *
 * It is dependency-free on purpose: node: builtins only, so CI can run it
 * without an install step. It is also tolerant of pages being rewritten
 * concurrently — if no HTML exists yet it simply reports that and exits 0.
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const siteDir = join(repoRoot, "site");
const assetsDir = join(siteDir, "assets");

const stylesheets = [
  join(assetsDir, "lens.css"),
  join(assetsDir, "theme.css"),
  join(assetsDir, "identity.css"),
];

/*
 * Every page is expected to pull in these three files. They are the shared
 * design system and the demo runtime, so if one is missing the whole site is
 * broken no matter what the HTML says.
 */
const requiredAssets = [
  join(assetsDir, "lens.css"),
  join(assetsDir, "theme.css"),
  join(assetsDir, "identity.css"),
  join(assetsDir, "core.js"),
  join(assetsDir, "router.js"),
];

const problems = [];
const reportedAssets = new Set();

function rel(path) {
  return relative(repoRoot, path) || path;
}

function report(where, message) {
  problems.push(`${where}: ${message}`);
}

function existsAsFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

/*
 * A link that points at http(s) or a protocol-relative // URL is a network
 * request. The site is meant to be fully offline: no CDN stylesheets, scripts,
 * images or fonts. Plain <a> links (github.com, store pages) are navigation,
 * not resources, so they stay allowed.
 */
const RESOURCE_LINK_REL =
  /(^|\s)(stylesheet|icon|shortcut|preload|prefetch|manifest|apple-touch-icon|mask-icon)(\s|$)/i;

/*
 * Collect every class defined in lens.css and theme.css. The design system is
 * shared, so a page may only use classes those two files already define; an
 * unknown class almost always means a typo or a style that never shipped.
 */
const definedClasses = new Set();
const loadedStylesheets = [];

for (const stylesheet of stylesheets) {
  const name = rel(stylesheet);
  if (!existsAsFile(stylesheet)) {
    report(name, "stylesheet is missing");
    reportedAssets.add(stylesheet);
    continue;
  }
  loadedStylesheets.push(name);
  const css = readFileSync(stylesheet, "utf8");
  for (const match of css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
    definedClasses.add(match[1]);
  }
}

const htmlFiles = readdirSync(siteDir)
  .filter((name) => name.endsWith(".html"))
  .sort();

// Nothing to validate while the page agents are still writing. Exiting clean
// keeps `bun run site` green in the window before the HTML lands.
if (htmlFiles.length === 0) {
  console.log("check-site: no pages yet");
  process.exit(0);
}

/*
 * The three shared assets must exist for any page to work. lens.css and
 * theme.css are already reported above if missing, so only speak up once.
 */
for (const asset of requiredAssets) {
  if (!existsAsFile(asset) && !reportedAssets.has(asset)) {
    report(rel(asset), "asset referenced by every page is missing");
  }
}

/*
 * Minimal tag scanner. We only need element names and their attributes, so a
 * regex is enough and avoids pulling in an HTML parser. Both quote styles and
 * bare attributes are handled because generated pages are not always tidy.
 */
function parseTags(html) {
  const tags = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let tag;
  while ((tag = tagRe.exec(html)) !== null) {
    const attrs = {};
    const attrRe =
      /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let attr;
    while ((attr = attrRe.exec(tag[2])) !== null) {
      const value = attr[3] ?? attr[4] ?? attr[5] ?? "";
      attrs[attr[1].toLowerCase()] = value;
    }
    tags.push({ name: tag[1].toLowerCase(), attrs });
  }
  return tags;
}

for (const file of htmlFiles) {
  const filePath = join(siteDir, file);
  let html;
  try {
    html = readFileSync(filePath, "utf8");
  } catch {
    // A page being rewritten can vanish mid-read; skip it rather than crash.
    continue;
  }
  const tags = parseTags(html);
  const ids = new Set(
    tags
      .map((tag) => tag.attrs.id)
      .filter((id) => typeof id === "string" && id.trim().length > 0),
  );

  /*
   * Required head content. Without these the page either fails basic HTML
   * expectations or shares nothing useful when linked on social media.
   */
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!title || title[1].trim().length === 0) {
    report(file, "missing a non-empty <title>");
  }

  const metas = tags.filter((tag) => tag.name === "meta");
  const links = tags.filter((tag) => tag.name === "link");

  const hasMeta = (key, value) =>
    metas.some(
      (tag) =>
        (tag.attrs[key] || "").toLowerCase() === value &&
        (tag.attrs.content || "").trim().length > 0,
    );

  if (!hasMeta("name", "description")) {
    report(file, 'missing <meta name="description">');
  }
  if (!hasMeta("property", "og:image")) {
    report(file, 'missing <meta property="og:image">');
  }
  if (!hasMeta("name", "twitter:card")) {
    report(file, 'missing <meta name="twitter:card">');
  }

  const canonical = links.some(
    (tag) =>
      /(^|\s)canonical(\s|$)/i.test(tag.attrs.rel || "") &&
      (tag.attrs.href || "").trim().length > 0,
  );
  if (!canonical) {
    report(file, 'missing <link rel="canonical">');
  }

  const stylesheetHrefs = links
    .filter((tag) => /(^|\s)stylesheet(\s|$)/i.test(tag.attrs.rel || ""))
    .map((tag) => (tag.attrs.href || "").trim().split("?")[0]); // ?v= is a cache-buster, not a path
  for (const sheet of ["assets/lens.css", "assets/theme.css", "assets/identity.css"]) {
    if (!stylesheetHrefs.some((href) => href.endsWith(sheet))) {
      report(file, `missing stylesheet link to ${sheet}`);
    }
  }

  const favicon = links.some((tag) =>
    /(^|\s)icon(\s|$)|apple-touch-icon/i.test(tag.attrs.rel || ""),
  );
  if (!favicon) {
    report(file, "missing a favicon <link rel=\"icon\">");
  }

  for (const tag of tags) {
    // Inline styles defeat theming and the strict offline CSP; the styles all
    // belong in lens.css or theme.css.
    if (Object.prototype.hasOwnProperty.call(tag.attrs, "style")) {
      report(file, `inline style attribute is not allowed on <${tag.name}>`);
    }

    if (typeof tag.attrs.class === "string") {
      for (const token of tag.attrs.class.split(/\s+/)) {
        if (token && !definedClasses.has(token)) {
          report(
            file,
            `class "${token}" is not defined in ${loadedStylesheets.join(" or ")}`,
          );
        }
      }
    }

    for (const key of ["href", "src"]) {
      const raw = tag.attrs[key];
      if (typeof raw !== "string") continue;
      const value = raw.trim();
      if (value.length === 0) continue;

      const isNetwork = /^https?:\/\//i.test(value) || value.startsWith("//");
      if (isNetwork) {
        const isResourceSrc = key === "src";
        const isResourceLink =
          tag.name === "link" && RESOURCE_LINK_REL.test(tag.attrs.rel || "");
        if (isResourceSrc || isResourceLink) {
          report(file, `external resource is not allowed: ${key}="${value}"`);
        }
        // External navigational links (github.com, stores) are fine.
        continue;
      }

      // mailto:, data:, tel:, javascript: — not files we can check.
      if (/^[a-z][a-z0-9+.-]*:/i.test(value)) continue;

      // Fragment-only links point inside the same page; the id must exist.
      if (value.startsWith("#")) {
        const fragment = value.slice(1);
        if (fragment.length > 0 && !ids.has(fragment)) {
          report(file, `href="${value}" does not match an element id`);
        }
        continue;
      }

      const clean = value.split("#")[0].split("?")[0];
      if (clean.length === 0) continue;

      const target = clean.startsWith("/")
        ? join(siteDir, clean)
        : resolve(dirname(filePath), clean);

      // Only police references that stay inside the site. Links out to the
      // repo (../README.md) are not part of the published page set.
      const inside = relative(siteDir, target);
      const insideSite =
        !inside.startsWith("..") && !isAbsolute(inside) && inside.length > 0;
      if (!insideSite) continue;

      if (!existsAsFile(target)) {
        report(file, `${key}="${value}" does not resolve to a file (${rel(target)})`);
      }
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }
  console.error(`check-site: ${problems.length} problems in ${htmlFiles.length} pages`);
  process.exit(1);
}

console.log(`check-site: OK (${htmlFiles.length} pages)`);
