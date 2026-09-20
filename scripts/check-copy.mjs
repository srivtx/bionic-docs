#!/usr/bin/env node
/*
 * Check that the numbers the site and README claim match reality.
 *
 * Every page asserts how many tests there are. Those were updated by hand each
 * time a test was added, which means the moment someone forgot, the site was
 * stating something untrue — and a claim like that is the first thing a
 * careful reader checks. This runs the suite, reads the real totals from it,
 * and fails if any surface disagrees.
 *
 * Run:  node scripts/check-copy.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function suiteTotals() {
  /* Bun writes its summary to stderr, so both streams are read. */
  const run = spawnSync("bun", ["test"], { cwd: root, encoding: "utf8" });
  const out = `${run.stdout || ""}${run.stderr || ""}`;
  const totals = out.match(/Ran (\d+) tests across (\d+) files/);
  if (!totals) {
    console.error("check-copy: could not read a test total (suite failed?)");
    process.exit(1);
  }
  return { tests: Number(totals[1]), files: Number(totals[2]) };
}

const { tests, files } = suiteTotals();
const problems = [];

const surfaces = [
  ...readdirSync(join(root, "site"))
    .filter((name) => name.endsWith(".html"))
    .map((name) => join("site", name)),
  "README.md",
];

for (const rel of surfaces) {
  const source = readFileSync(join(root, rel), "utf8");
  /* Tags become spaces so `172</span><span>tests` still reads as a sentence. */
  const text = source.replace(/<[^>]+>/g, " ");

  for (const match of text.matchAll(/(\d{2,4})\s+tests?\b/g)) {
    if (Number(match[1]) !== tests) {
      problems.push(`${rel}: claims ${match[1]} tests where the suite has ${tests}`);
    }
  }
  for (const match of text.matchAll(/(\d{2,4})\s+tests? across (\d{1,3}) files/g)) {
    if (Number(match[1]) !== tests || Number(match[2]) !== files) {
      problems.push(
        `${rel}: claims ${match[1]} tests across ${match[2]} files where the suite has ${tests} across ${files}`,
      );
    }
  }
  /* The shields badge states it too, in its own shape. */
  for (const match of source.matchAll(/badge\/tests-(\d{2,4})-/g)) {
    if (Number(match[1]) !== tests) {
      problems.push(`${rel}: badge claims ${match[1]} tests where the suite has ${tests}`);
    }
  }
}

if (problems.length > 0) {
  for (const line of [...new Set(problems)]) console.error(`check-copy: ${line}`);
  console.error(`check-copy: the suite has ${tests} tests across ${files} files`);
  process.exit(1);
}

console.log(`check-copy: OK (${tests} tests across ${files} files, every claim agrees)`);
