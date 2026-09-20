/**
 * Build the landing-page demo bundle.
 *
 * The websites ship the *real* fixation algorithm: this bundles
 * `src/core/algorithm.ts` and its dependencies into `site/assets/core.js`,
 * exposed as `window.BionicCore`. The demo on the page therefore renders
 * exactly what the extension renders — there is no second implementation to
 * drift out of sync.
 *
 * Run with `bun run demo`.
 */
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outfile = join(root, "site", "assets", "core.js");

const entry = `
import { bionicText, emphasize, boldLength, MAX_TOKEN_LETTERS, CORE_PACKAGE_VERSION } from "./src/core/algorithm";
import { MODES, MODE_IDS, DEFAULT_SETTINGS, SETTINGS_VERSION, sanitizeSettings, clamp } from "./src/shared/types";
import { parseRule, DEFAULT_RULE } from "./src/core/rules";
import { COMMON_WORDS, splitAffixes, isLetter, DEFAULT_VOWELS } from "./src/core/languages";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (ch) => ESCAPES[ch]);
}

/*
 * Site glue. The extensions wrap a word's fixation head in
 * \`<b class="bp-head">\` and, in low-distraction mode, wrap the following
 * text node in \`<span class="bp-tail">\`. This produces that same markup
 * from the same pure \`emphasize()\`, so the demo and the extension agree.
 */
function bionicHtml(text, options) {
  const dim = options.mode === "dim";
  let out = "";
  for (const part of String(text).split(/(\\s+)/)) {
    if (part.length === 0) continue;
    if (/^\\s+$/.test(part)) {
      out += part;
      continue;
    }
    const split = emphasize(part, options);
    if (split === null) {
      out += escapeHtml(part);
      continue;
    }
    out += '<b class="bp-head">' + escapeHtml(split.head) + "</b>";
    out += dim
      ? '<span class="bp-tail">' + escapeHtml(split.tail) + "</span>"
      : escapeHtml(split.tail);
  }
  return out;
}

/** Apply the effect to an element, replacing its text content. */
function paint(element, text, options) {
  if (!element) return;
  element.innerHTML = bionicHtml(text, options);
}

function countWords(text) {
  const matches = String(text).match(/[\\p{L}\\p{N}][\\p{L}\\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

export {
  bionicText,
  bionicHtml,
  paint,
  countWords,
  emphasize,
  boldLength,
  MAX_TOKEN_LETTERS,
  CORE_PACKAGE_VERSION,
  MODES,
  MODE_IDS,
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  sanitizeSettings,
  clamp,
  parseRule,
  DEFAULT_RULE,
  COMMON_WORDS,
  splitAffixes,
  isLetter,
  DEFAULT_VOWELS,
};
`;

const result = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: "demo-entry.ts", loader: "ts" },
  bundle: true,
  format: "iife",
  globalName: "BionicCore",
  platform: "browser",
  target: ["es2020"],
  minify: false,
  legalComments: "none",
  banner: {
    js: "/* bionic core — compiled from src/core/*.ts by scripts/build-demo.mjs. The same code the extension runs. */",
  },
  outfile,
  logLevel: "warning",
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`demo: site/assets/core.js — ${(bytes / 1024).toFixed(1)} kB`);
