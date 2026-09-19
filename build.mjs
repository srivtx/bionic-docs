#!/usr/bin/env node
/**
 * Build Bionic Docs for Chrome and Firefox.
 *
 *   node build.mjs              both targets
 *   node build.mjs chrome       one target
 *   node build.mjs --watch      rebuild on change
 *
 * PDF.js and its worker/fonts/cmaps are bundled locally; no remote code.
 */
import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestFor } from "./scripts/manifest.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const MODULES = join(ROOT, "node_modules");

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const requested = args.filter((a) => a === "chrome" || a === "firefox");
const targets = requested.length > 0 ? requested : ["chrome", "firefox"];

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const VERSION = pkg.version ?? "0.0.0";
const BROWSER_TARGET = ["chrome116", "firefox140"];

const ENTRIES = [
  { in: join(SRC, "reader/reader.ts"), out: "reader.js", format: "iife" },
  { in: join(SRC, "popup/popup.ts"), out: "popup.js", format: "iife" },
  { in: join(SRC, "options/options.ts"), out: "options.js", format: "iife" },
  { in: join(SRC, "background/background.ts"), out: "background.js", format: "iife" },
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyTree(from, to) {
  if (!(await exists(from))) return;
  await cp(from, to, { recursive: true });
}

async function copyStatic(targetDir) {
  await cp(join(SRC, "reader/reader.html"), join(targetDir, "reader.html"));
  await cp(join(SRC, "reader/reader.css"), join(targetDir, "reader.css"));
  await cp(join(SRC, "popup/popup.html"), join(targetDir, "popup.html"));
  await cp(join(SRC, "popup/popup.css"), join(targetDir, "popup.css"));
  await cp(join(SRC, "options/options.html"), join(targetDir, "options.html"));
  await cp(join(SRC, "options/options.css"), join(targetDir, "options.css"));

  const iconsDir = join(targetDir, "icons");
  await mkdir(iconsDir, { recursive: true });
  const icons = join(ROOT, "assets/icons");
  if (await exists(icons)) {
    for (const file of readdirSync(icons)) await cp(join(icons, file), join(iconsDir, file));
  }

  // PDF.js worker and assets, bundled locally.
  const pdfDist = join(MODULES, "pdfjs-dist");
  const worker = join(pdfDist, "build", "pdf.worker.min.mjs");
  if (await exists(worker)) await cp(worker, join(targetDir, "pdf.worker.min.mjs"));
  await copyTree(join(pdfDist, "cmaps"), join(targetDir, "cmaps"));
  await copyTree(join(pdfDist, "standard_fonts"), join(targetDir, "standard_fonts"));
}

function esbuildOptions(target) {
  const targetDir = join(DIST, target);
  return ENTRIES.map((entry) => ({
    entryPoints: [entry.in],
    outfile: join(targetDir, entry.out),
    bundle: true,
    format: entry.format,
    platform: "browser",
    target: BROWSER_TARGET,
    sourcemap: false,
    minify: false,
    logLevel: "warning",
    legalComments: "none",
  }));
}

async function writeManifest(target) {
  const targetDir = join(DIST, target);
  await writeFile(join(targetDir, "manifest.json"), JSON.stringify(manifestFor(target, VERSION), null, 2) + "\n");
}

async function buildTarget(target) {
  const targetDir = join(DIST, target);
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  for (const opts of esbuildOptions(target)) await build(opts);
  await copyStatic(targetDir);
  await writeManifest(target);
  console.log(`built dist/${target}`);
}

async function watchTargets() {
  const contexts = [];
  for (const target of targets) {
    const targetDir = join(DIST, target);
    await mkdir(targetDir, { recursive: true });
    await copyStatic(targetDir);
    await writeManifest(target);
    for (const opts of esbuildOptions(target)) {
      const ctx = await context({
        ...opts,
        plugins: [
          {
            name: "log-rebuild",
            setup(b) {
              b.onEnd((result) => {
                if (result.errors.length === 0) console.log(`rebuilt dist/${target}`);
              });
            },
          },
        ],
      });
      await ctx.watch();
      contexts.push(ctx);
    }
  }
  console.log("watching for changes (Ctrl+C to stop)");
  await new Promise(() => {});
}

if (watch) await watchTargets();
else for (const target of targets) await buildTarget(target);

void existsSync;
