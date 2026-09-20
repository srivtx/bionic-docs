import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/*
 * Generate site/assets/og.png: the 1200x630 social card used by the og:image
 * and twitter:image tags. The card is built as a self-contained HTML document
 * (inline CSS, a file:// font, no network) and screenshotted with headless
 * Chrome, so there are no npm dependencies to install.
 *
 * If Chrome is not on this machine (CI images rarely ship it) we skip the card
 * and exit 0 rather than break the build; the committed og.png keeps working.
 */

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);
const repoName = basename(repoRoot);
const siteAssets = join(repoRoot, "site", "assets");
const outputPath = join(siteAssets, "og.png");
const fontPath = join(siteAssets, "fonts", "geist-latin.woff2");

const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!existsSync(CHROME_PATH)) {
  console.log(
    `make-og: Chrome not found at ${CHROME_PATH}; keeping the checked-in og.png`,
  );
  process.exit(0);
}

/*
 * Per-repo copy and marks. Each mark is inline SVG so the card stays a single
 * self-contained document. Both marks echo the product: a word split into a
 * solid head and a faded tail.
 */
const MARK_PAGE = `
  <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
    <rect x="6" y="6" width="36" height="36" rx="10" fill="none"
      stroke="#0a0a0a" stroke-width="3"/>
    <line x1="15" y1="24" x2="24" y2="24" stroke="#0a0a0a"
      stroke-width="3" stroke-linecap="round"/>
    <line x1="26" y1="24" x2="35" y2="24" stroke="#0a0a0a"
      stroke-width="3" stroke-linecap="round" opacity="0.4"/>
  </svg>`;

const MARK_DOCS = `
  <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
    <path d="M14 6 H30 L38 14 V40 a2 2 0 0 1 -2 2 H14 a2 2 0 0 1 -2 -2 V8
      a2 2 0 0 1 2 -2 Z" fill="none" stroke="#0a0a0a" stroke-width="3"
      stroke-linejoin="round"/>
    <path d="M30 6 V14 H38" fill="none" stroke="#0a0a0a" stroke-width="3"
      stroke-linejoin="round"/>
    <line x1="18" y1="28" x2="24" y2="28" stroke="#0a0a0a"
      stroke-width="3" stroke-linecap="round"/>
    <line x1="26" y1="28" x2="33" y2="28" stroke="#0a0a0a"
      stroke-width="3" stroke-linecap="round" opacity="0.4"/>
  </svg>`;

const CARDS = {
  "bionic-page": {
    name: "bionic-page",
    tagline: "Turn any web page into a bionic reading page.",
    footnote: "Manifest V3 · Chrome + Firefox · no network",
    mark: MARK_PAGE,
  },
  "bionic-docs": {
    name: "bionic-docs",
    tagline: "Read PDF and EPUB with bionic fixation, entirely on-device.",
    footnote: "Manifest V3 · Chrome + Firefox · no upload",
    mark: MARK_DOCS,
  },
};

const card = CARDS[repoName] ?? {
  name: repoName,
  tagline: "Read with bionic fixation.",
  footnote: "Manifest V3 · Chrome + Firefox",
  mark: MARK_PAGE,
};

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/*
 * Render a line in the two-tone bionic style: the leading half of each word is
 * bold and fully opaque, the trailing half sits at 72% opacity. The card
 * demonstrates the product with the product.
 */
const bionic = (text) =>
  text
    .split(/(\s+)/)
    .map((part) => {
      if (part.length === 0 || /^\s+$/.test(part)) return part;
      const cut = Math.ceil(part.length / 2);
      return `<b>${escapeHtml(part.slice(0, cut))}</b><span class="tail">${escapeHtml(
        part.slice(cut),
      )}</span>`;
    })
    .join("");

const fontUrl = pathToFileURL(fontPath).href;
const fixation = "Reading should keep your place.";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(card.name)} social card</title>
<style>
  @font-face {
    font-family: "Geist";
    src: url("${fontUrl}") format("woff2");
    font-weight: 100 900;
    font-style: normal;
    font-display: block;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: #0a0a0a;
    color: #fafafa;
    font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .frame {
    position: absolute;
    inset: 24px;
    border: 1px solid #232326;
    border-radius: 18px;
  }
  .content {
    position: absolute;
    inset: 0;
    padding: 88px;
    display: flex;
    flex-direction: column;
  }
  .brand { display: flex; align-items: center; gap: 18px; }
  .tile {
    width: 58px;
    height: 58px;
    border-radius: 15px;
    background: #818cf8;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .name {
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .tagline {
    margin-top: auto;
    max-width: 820px;
    font-size: 34px;
    line-height: 1.32;
    color: rgba(250, 250, 250, 0.62);
    letter-spacing: -0.01em;
  }
  .fixation {
    margin-top: 30px;
    font-size: 78px;
    line-height: 1.08;
    letter-spacing: -0.025em;
  }
  .fixation b { font-weight: 700; color: #fafafa; }
  .fixation .tail { font-weight: 700; opacity: 0.72; }
  .footnote {
    margin-top: 42px;
    font-size: 20px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(250, 250, 250, 0.42);
  }
</style>
</head>
<body>
  <div class="frame"></div>
  <div class="content">
    <div class="brand">
      <div class="tile">${card.mark}</div>
      <span class="name">${escapeHtml(card.name)}</span>
    </div>
    <div>
      <p class="tagline">${escapeHtml(card.tagline)}</p>
      <p class="fixation">${bionic(fixation)}</p>
      <p class="footnote">${escapeHtml(card.footnote)}</p>
    </div>
  </div>
</body>
</html>
`;

const tempDir = mkdtempSync(join(tmpdir(), "bionic-og-"));
const htmlPath = join(tempDir, "card.html");
const screenshotPath = join(tempDir, "og.png");
const profileDir = join(tempDir, "chrome-profile");
mkdirSync(profileDir, { recursive: true });
writeFileSync(htmlPath, html, "utf8");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let rendered = false;

try {
  const chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      `--screenshot=${screenshotPath}`,
      "--window-size=1200,630",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--no-first-run",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--disable-extensions",
      `--user-data-dir=${profileDir}`,
      "--allow-file-access-from-files",
      "--virtual-time-budget=1500",
      pathToFileURL(htmlPath).href,
    ],
    { stdio: "ignore" },
  );
  chrome.on("error", () => {});

  // Headless Chrome writes the PNG but can keep its updater and network
  // services alive for a long time afterwards, so poll for the file and stop
  // the browser ourselves instead of blocking until it decides to exit.
  const deadline = Date.now() + 45000;
  while (!existsSync(screenshotPath) && Date.now() < deadline) {
    await sleep(150);
  }

  if (existsSync(screenshotPath)) {
    await sleep(400);
    mkdirSync(siteAssets, { recursive: true });
    copyFileSync(screenshotPath, outputPath);
    rendered = true;
  }

  chrome.kill("SIGKILL");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

if (!rendered) {
  console.error("make-og: Chrome did not produce a screenshot");
  process.exit(1);
}

const bytes = statSync(outputPath).size;
const png = readFileSync(outputPath);
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
console.log(
  `make-og: wrote ${outputPath} (${width}x${height}, ${bytes} bytes)`,
);
