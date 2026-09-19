#!/usr/bin/env node
/** Zip the built targets for store upload. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const version = pkg.version ?? "0.0.0";
const outDir = join(ROOT, "dist");
mkdirSync(outDir, { recursive: true });

let failures = 0;
for (const target of ["chrome", "firefox"]) {
  const dir = join(ROOT, "dist", target);
  if (!existsSync(join(dir, "manifest.json"))) {
    console.error(`skip ${target}: dist/${target}/manifest.json missing (run "bun run build")`);
    failures += 1;
    continue;
  }
  const out = join(outDir, `bionic-docs-${target}-${version}.zip`);
  rmSync(out, { force: true });
  try {
    execFileSync("zip", ["-r", "-q", out, "."], { cwd: dir, stdio: "inherit" });
    console.log(`wrote ${out}`);
  } catch {
    console.error(`zip not available; archive dist/${target} manually`);
    failures += 1;
  }
}
process.exitCode = failures > 0 ? 1 : 0;
