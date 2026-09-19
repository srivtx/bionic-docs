#!/usr/bin/env node
/**
 * Assert that every file a manifest references exists in dist, and that the
 * version matches package.json. Run after `node build.mjs`.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
let failures = 0;

function fail(message) {
  console.error(`FAIL ${message}`);
  failures += 1;
}

function globPresent(dir, pattern) {
  if (!pattern.includes("*")) return existsSync(join(dir, pattern));
  const prefix = pattern.slice(0, pattern.indexOf("*"));
  const abs = join(dir, prefix);
  if (!existsSync(abs)) return false;
  try {
    return readdirSync(abs).length > 0;
  } catch {
    return false;
  }
}

for (const target of ["chrome", "firefox"]) {
  const dir = join(ROOT, "dist", target);
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    fail(`dist/${target}/manifest.json missing (run build)`);
    continue;
  }
  const m = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (m.version !== pkg.version) fail(`${target}: version ${m.version} != package.json ${pkg.version}`);
  if (m.manifest_version !== 3) fail(`${target}: manifest_version is not 3`);

  const referenced = new Set();
  if (m.action?.default_popup) referenced.add(m.action.default_popup);
  if (m.options_ui?.page) referenced.add(m.options_ui.page);
  if (m.background?.service_worker) referenced.add(m.background.service_worker);
  for (const s of m.background?.scripts ?? []) referenced.add(s);
  for (const icon of Object.values(m.icons ?? {})) referenced.add(icon);
  for (const resource of m.web_accessible_resources ?? []) {
    for (const r of resource.resources ?? []) referenced.add(r);
  }

  for (const rel of referenced) {
    if (!globPresent(dir, rel) && !rel.includes("*")) fail(`${target}: referenced file missing: ${rel}`);
    if (rel.includes("*") && !globPresent(dir, rel)) fail(`${target}: referenced glob empty: ${rel}`);
  }

  if (target === "chrome" && m.browser_specific_settings) fail("chrome: browser_specific_settings must be absent");
  if (target === "firefox" && !m.browser_specific_settings?.gecko?.id) fail("firefox: gecko.id missing");
  if (target === "firefox" && m.minimum_chrome_version) fail("firefox: minimum_chrome_version must be absent");

  if (!existsSync(join(dir, "pdf.worker.min.mjs"))) fail(`${target}: pdf.worker.min.mjs missing`);

  if (failures === 0) console.log(`ok dist/${target}: ${referenced.size} referenced entries present`);
}

process.exitCode = failures > 0 ? 1 : 0;
