/**
 * Bionic reading algorithm core.
 *
 * Pure functions only: no DOM, no globals, no randomness, no clocks, no
 * network. Every entry point is deterministic and total.
 */

import type { ModeId } from "../shared/types";
import { COMMON_WORDS, DEFAULT_VOWELS, isLetter, splitAffixes } from "./languages";
import { DEFAULT_RULE, parseRule } from "./rules";
import type { RuleSpec } from "./rules";

export interface BionicOptions {
  mode: ModeId;
  intensity: number;
  minWordLength: number;
  skipCommonWords: boolean;
  rule: string;
  customVowels: string;
}

export const CORE_PACKAGE_VERSION = "0.1.0";

function letterCount(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (isLetter(ch)) count++;
  }
  return count;
}

/** Prefix of `core` containing at most its first `n` letters (inclusive). */
function takeLeadingLetters(core: string, n: number): string {
  if (n <= 0) return "";
  let count = 0;
  let end = 0;
  for (const ch of core) {
    if (count >= n) break;
    end += ch.length;
    if (isLetter(ch)) count++;
  }
  return core.slice(0, end);
}

function vowelSet(customVowels: string): Set<string> {
  const source = customVowels.length > 0 ? customVowels : DEFAULT_VOWELS;
  const set = new Set<string>();
  for (const ch of source) set.add(ch.toLowerCase());
  return set;
}

/** Letter index (1-based) of the end of the first vowel group, or 0. */
function vowelGroupLength(core: string, vowels: Set<string>): number {
  let letterIndex = 0;
  let lastVowel = -1;
  let seenVowel = false;
  for (const ch of core) {
    if (!isLetter(ch)) continue;
    letterIndex++;
    if (vowels.has(ch.toLowerCase())) {
      seenVowel = true;
      lastVowel = letterIndex;
    } else if (seenVowel) {
      break;
    }
  }
  return lastVowel < 0 ? 0 : lastVowel;
}

function ruleLength(letters: number, spec: RuleSpec): number {
  if (letters <= 4) {
    const count = spec.counts[letters - 1];
    if (count !== undefined) return count;
  }
  const fraction = Number.isFinite(spec.fraction) ? spec.fraction : 0;
  return Math.ceil(fraction * letters);
}

/**
 * Tokens that must never be emphasized: URLs, email addresses, and very long
 * unbroken runs (a CJK sentence with no spaces, a hash, a base64 blob). Half-
 * bolding a whole sentence is worse than leaving it alone.
 */
export const MAX_TOKEN_LETTERS = 40;
const URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUnbreakableToken(word: string, letters: number): boolean {
  if (letters > MAX_TOKEN_LETTERS) return true;
  const trimmed = word.trim();
  if (URL_RE.test(trimmed)) return true;
  if (trimmed.startsWith("www.")) return true;
  return EMAIL_RE.test(trimmed);
}

/**
 * Number of leading letters to emphasize (0 = leave the word untouched).
 * Never exceeds the core letter count.
 */
export function boldLength(word: string, options: BionicOptions): number {
  const { core } = splitAffixes(word);
  const letters = letterCount(core);
  if (letters === 0) return 0;
  if (isUnbreakableToken(core, letters)) return 0;

  const spec = options.mode === "rules" ? parseRule(options.rule) : null;
  if (COMMON_WORDS.has(core.toLowerCase()) && options.skipCommonWords) {
    const allowed = spec !== null && spec.highLightCommon;
    if (!allowed) return 0;
  }

  const bypassesMin = options.mode === "rules" || options.mode === "half";
  if (!bypassesMin && letters < options.minWordLength) return 0;

  let n: number;
  switch (options.mode) {
    case "half":
      n = letters < 2 ? 0 : Math.ceil(letters / 2);
      break;
    case "vowel": {
      const cap = Math.ceil(letters / 2) + 1;
      n = Math.min(vowelGroupLength(core, vowelSet(options.customVowels)), cap);
      break;
    }
    case "rules":
      n = ruleLength(letters, spec ?? parseRule(DEFAULT_RULE));
      break;
    case "dim":
    case "classic":
    default:
      n = Math.max(1, Math.ceil(letters * options.intensity));
      break;
  }

  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), letters);
}

/**
 * Split a whole word so `head` (which may include a leading affix) can be
 * wrapped. Returns null when the word should be left untouched. Always
 * satisfies `head + tail === word`.
 */
export function emphasize(
  word: string,
  options: BionicOptions,
): { head: string; tail: string } | null {
  const n = boldLength(word, options);
  if (n <= 0) return null;

  const { prefix, core, suffix } = splitAffixes(word);
  const headCore = takeLeadingLetters(core, n);
  if (headCore.length === 0) return null;

  return {
    head: prefix + headCore,
    tail: core.slice(headCore.length) + suffix,
  };
}

/** Plain-text convenience: wrap emphasized heads in `<b>..</b>`. */
export function bionicText(text: string, options: BionicOptions): string {
  if (text.length === 0) return text;

  let out = "";
  for (const part of text.split(/(\s+)/)) {
    if (part.length === 0) continue;
    if (/^\s+$/.test(part)) {
      out += part;
      continue;
    }
    const split = emphasize(part, options);
    out += split === null ? part : `<b>${split.head}</b>${split.tail}`;
  }
  return out;
}
