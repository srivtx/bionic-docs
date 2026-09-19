/**
 * Tests for the pure core (algorithm, rules, languages) and the shared
 * settings contract. The core is frozen, so these tests pin the behavioral
 * rules: the ten algorithm rules, unicode/affix handling, unbreakable tokens,
 * rule parsing fallbacks, and settings clamping.
 */

import { describe, expect, test } from "bun:test";

import {
  CORE_PACKAGE_VERSION,
  MAX_TOKEN_LETTERS,
  bionicText,
  boldLength,
  emphasize,
  isUnbreakableToken,
} from "../src/core/algorithm";
import type { BionicOptions } from "../src/core/algorithm";
import { COMMON_WORDS, DEFAULT_VOWELS, isLetter, splitAffixes } from "../src/core/languages";
import { DEFAULT_RULE, parseRule } from "../src/core/rules";
import type { RuleSpec } from "../src/core/rules";
import {
  DEFAULT_SETTINGS,
  MODE_IDS,
  SETTINGS_VERSION,
  sanitizeSettings,
} from "../src/shared/types";
import type { ModeId } from "../src/shared/types";

const ALL_MODES: readonly ModeId[] = MODE_IDS;

const BASE: BionicOptions = {
  mode: "classic",
  intensity: 0.5,
  minWordLength: 2,
  skipCommonWords: false,
  rule: DEFAULT_RULE,
  customVowels: "",
};

function opt(overrides: Partial<BionicOptions>): BionicOptions {
  return { ...BASE, ...overrides };
}

function lettersOf(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (isLetter(ch)) n++;
  }
  return n;
}

function coreLetterCount(word: string): number {
  return lettersOf(splitAffixes(word).core);
}

function stripTags(html: string): string {
  return html.replace(/<\/?b>/g, "");
}

describe("algorithm: the ten core rules", () => {
  test("rule 1: boldLength never exceeds the core letter count", () => {
    const words = [
      "strength",
      "well-known",
      "café",
      "naïve",
      "supercalifragilistic",
      "HELLO",
      "abc123",
      "a",
      "I",
      "don't",
      "résumé",
      "12345",
      "",
    ];
    for (const mode of ALL_MODES) {
      for (const word of words) {
        const n = boldLength(word, opt({ mode }));
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(coreLetterCount(word));
      }
    }
  });

  test("rule 2: empty and whitespace-only tokens return 0 / null", () => {
    for (const mode of ALL_MODES) {
      expect(boldLength("", opt({ mode }))).toBe(0);
      expect(boldLength("   ", opt({ mode }))).toBe(0);
      expect(boldLength("\t\n", opt({ mode }))).toBe(0);
      expect(boldLength("...", opt({ mode }))).toBe(0);
    }
    expect(emphasize("", opt({}))).toBeNull();
    expect(emphasize("   ", opt({}))).toBeNull();
  });

  test("rule 3: minWordLength gates classic/vowel/dim but not rules/half", () => {
    const min = 8;
    expect(boldLength("at", opt({ mode: "classic", minWordLength: min }))).toBe(0);
    expect(boldLength("at", opt({ mode: "vowel", minWordLength: min }))).toBe(0);
    expect(boldLength("at", opt({ mode: "dim", minWordLength: min }))).toBe(0);

    expect(boldLength("at", opt({ mode: "half", minWordLength: min }))).toBe(1);
    expect(boldLength("abc", opt({ mode: "half", minWordLength: min }))).toBe(2);
    expect(boldLength("at", opt({ mode: "rules", minWordLength: min }))).toBe(1);
    expect(boldLength("abc", opt({ mode: "rules", minWordLength: min }))).toBe(1);
  });

  test("rule 4: skipCommonWords returns 0 for common words", () => {
    for (const mode of ["classic", "half", "vowel", "dim"] as const) {
      for (const word of ["the", "and", "of", "to"]) {
        expect(boldLength(word, opt({ mode, skipCommonWords: true, minWordLength: 2 }))).toBe(0);
      }
    }
    expect(boldLength("the", opt({ mode: "half", skipCommonWords: false }))).toBe(2);
    expect(boldLength("the", opt({ mode: "classic", skipCommonWords: false }))).toBe(2);
    // A "+" rule opts common words back into emphasis.
    expect(
      boldLength("the", opt({ mode: "rules", rule: "+0 1 1 2 0.4", skipCommonWords: true })),
    ).toBe(1);
  });

  test("rule 5: half mode bolds the first half of a word", () => {
    expect(boldLength("strength", opt({ mode: "half" }))).toBe(4);
    expect(boldLength("abcdefgh", opt({ mode: "half" }))).toBe(4);
    expect(boldLength("the", opt({ mode: "half" }))).toBe(2);
  });

  test("rule 6: classic mode follows intensity, always at least 1", () => {
    expect(boldLength("strength", opt({ mode: "classic", intensity: 0.5 }))).toBe(4);
    expect(boldLength("strength", opt({ mode: "classic", intensity: 0.25 }))).toBe(2);
    expect(boldLength("at", opt({ mode: "classic", intensity: 0.2, minWordLength: 2 }))).toBe(1);
  });

  test("rule 7: vowel mode emphasizes through the first vowel group", () => {
    expect(boldLength("strength", opt({ mode: "vowel", minWordLength: 2 }))).toBe(4);
    expect(boldLength("apple", opt({ mode: "vowel", minWordLength: 2 }))).toBe(1);
    expect(boldLength("banana", opt({ mode: "vowel", minWordLength: 2 }))).toBe(2);
    const n = boldLength("strength", opt({ mode: "vowel", minWordLength: 2 }));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(Math.ceil(8 / 2) + 1);
    const split = emphasize("strength", opt({ mode: "vowel", minWordLength: 2 }));
    expect(split).not.toBeNull();
    expect(split?.head).toContain("e");
  });

  test("rule 8: rules mode follows '0 1 1 2 0.4'", () => {
    const o = opt({ mode: "rules", rule: "0 1 1 2 0.4", minWordLength: 2 });
    expect(boldLength("a", o)).toBe(0);
    expect(boldLength("ab", o)).toBe(1);
    expect(boldLength("abc", o)).toBe(1);
    expect(boldLength("abcd", o)).toBe(2);
    expect(boldLength("abcde", o)).toBe(2);
    expect(boldLength("abcdefgh", o)).toBe(4);
    expect(boldLength("abcdefghij", o)).toBe(4);
  });

  test("rule 9: functions are pure and deterministic", () => {
    const o = opt({ mode: "classic", intensity: 0.5 });
    expect(boldLength("hello", o)).toBe(boldLength("hello", o));
    expect(emphasize("hello", o)).toEqual(emphasize("hello", o));
    expect(parseRule(DEFAULT_RULE)).toEqual(parseRule(DEFAULT_RULE));
    const a = emphasize("hello", o);
    const b = emphasize("hello", o);
    expect(a).not.toBe(b);
    expect(typeof CORE_PACKAGE_VERSION).toBe("string");
    expect(CORE_PACKAGE_VERSION.length).toBeGreaterThan(0);
  });

  test("rule 10: bionicText round-trips to the exact input and never nests", () => {
    const inputs = [
      "",
      " ",
      "   ",
      "\t\n",
      "x",
      "hello world",
      "(hello)",
      '"world"',
      "…word…",
      "[test]",
      "{value}",
      "café",
      "naïve",
      "über",
      "résumé",
      "señor",
      "well-known",
      "mother-in-law",
      "e-mail",
      "HELLO",
      "NASA",
      "abc123",
      "2,000",
      "#tag123",
      "don't",
      "it's",
      "state-of-the-art",
      "cafe\u0301",
    ];
    for (const mode of ALL_MODES) {
      const o = opt({ mode, minWordLength: 2 });
      for (const input of inputs) {
        const html = bionicText(input, o);
        expect(html).not.toContain("<b><b>");
        expect(html).not.toContain("</b></b>");
        expect(stripTags(html)).toBe(input);
      }
    }
    expect(stripTags(bionicText("x", opt({})))).toBe("x");
  });
});

describe("languages: unicode, accents and affixes", () => {
  test("DEFAULT_VOWELS covers ascii and accented vowels", () => {
    expect(DEFAULT_VOWELS).toContain("a");
    expect(DEFAULT_VOWELS).toContain("y");
    expect(DEFAULT_VOWELS).toContain("é");
    expect(DEFAULT_VOWELS).toContain("ø");
    expect(DEFAULT_VOWELS).toContain("ü");
  });

  test("COMMON_WORDS is a lowercase function-word set", () => {
    expect(COMMON_WORDS.has("the")).toBeTrue();
    expect(COMMON_WORDS.has("and")).toBeTrue();
    expect(COMMON_WORDS.has("of")).toBeTrue();
    expect(COMMON_WORDS.has("The")).toBeFalse();
  });

  test("isLetter is unicode aware and accepts combining marks", () => {
    expect(isLetter("a")).toBeTrue();
    expect(isLetter("Z")).toBeTrue();
    expect(isLetter("é")).toBeTrue();
    expect(isLetter("ø")).toBeTrue();
    expect(isLetter("ñ")).toBeTrue();
    expect(isLetter("\u0301")).toBeTrue();
    expect(isLetter(" ")).toBeFalse();
    expect(isLetter("1")).toBeFalse();
    expect(isLetter("!")).toBeFalse();
    expect(isLetter("")).toBeFalse();
  });

  test("splitAffixes separates leading and trailing non-letters", () => {
    expect(splitAffixes("(hello)")).toEqual({ prefix: "(", core: "hello", suffix: ")" });
    expect(splitAffixes('"world"')).toEqual({ prefix: '"', core: "world", suffix: '"' });
    expect(splitAffixes("…word…")).toEqual({ prefix: "…", core: "word", suffix: "…" });
    expect(splitAffixes("hello")).toEqual({ prefix: "", core: "hello", suffix: "" });
    expect(splitAffixes("...")).toEqual({ prefix: "...", core: "", suffix: "" });
    expect(splitAffixes("12345")).toEqual({ prefix: "12345", core: "", suffix: "" });
    expect(splitAffixes("well-known")).toEqual({ prefix: "", core: "well-known", suffix: "" });
    expect(splitAffixes("[[a]]")).toEqual({ prefix: "[[", core: "a", suffix: "]]" });
  });

  test("accented and decomposed words keep their marks", () => {
    const o = opt({ mode: "half" });
    expect(coreLetterCount("café")).toBe(4);
    expect(coreLetterCount("cafe\u0301")).toBe(5);
    expect(emphasize("café", o)).toEqual({ head: "ca", tail: "fé" });
    expect(stripTags(bionicText("résumé naïve", o))).toBe("résumé naïve");
  });

  test("all-caps words are treated case-insensitively", () => {
    const o = opt({ mode: "classic", intensity: 0.5 });
    expect(boldLength("HELLO", o)).toBe(3);
    expect(emphasize("HELLO", o)).toEqual({ head: "HEL", tail: "LO" });
  });

  test("affixes stay outside the emphasized core", () => {
    expect(emphasize("(hello)", opt({ mode: "classic", intensity: 0.5 }))).toEqual({
      head: "(hel",
      tail: "lo)",
    });
    const quoted = emphasize('"world"', opt({ mode: "half" }));
    expect(quoted).toEqual({ head: '"wor', tail: 'ld"' });
  });

  test("emphasize: head + tail always reconstructs the whole word", () => {
    const words = [
      "(hello)",
      '"world"',
      "…word…",
      "well-known",
      "don't",
      "café",
      "HELLO",
      "abc123",
      "supercalifragilistic",
    ];
    for (const mode of ALL_MODES) {
      for (const word of words) {
        const split = emphasize(word, opt({ mode, minWordLength: 2 }));
        if (split === null) continue;
        expect(split.head + split.tail).toBe(word);
        expect(split.head.length).toBeGreaterThan(0);
      }
    }
  });

  test("punctuation-only and digit-only tokens are untouched", () => {
    const o = opt({ mode: "classic" });
    for (const word of ["12345", "3.14", "!!!", "…", "''"]) {
      expect(emphasize(word, o)).toBeNull();
      expect(boldLength(word, o)).toBe(0);
    }
    expect(bionicText("3.14 42", o)).toBe("3.14 42");
  });

  test("hyphenated words count letters across the hyphen and are emphasized", () => {
    const o = opt({ mode: "classic", intensity: 0.5 });
    expect(coreLetterCount("well-known")).toBe(9);
    expect(boldLength("well-known", o)).toBe(5);
    const split = emphasize("well-known", o);
    expect(split).not.toBeNull();
    if (split) expect(split.head + split.tail).toBe("well-known");
    expect(boldLength("mother-in-law", opt({ mode: "half" }))).toBe(6);
  });
});

describe("robustness: unbreakable tokens", () => {
  const OPTIONS = opt({ mode: "half", minWordLength: 3 });

  const cases = [
    "https://example.com/a/very/long/path?with=query",
    "http://localhost:3000/",
    "www.example.com",
    "user@example.com",
    "someone.name+tag@sub.domain.co",
  ];
  for (const token of cases) {
    test(`leaves ${token} alone`, () => {
      expect(boldLength(token, OPTIONS)).toBe(0);
      expect(emphasize(token, OPTIONS)).toBeNull();
      expect(bionicText(token, OPTIONS)).toBe(token);
    });
  }

  test("leaves very long unbroken runs alone (CJK sentence, long hash)", () => {
    const cjk =
      "这是一段没有任何空格的很长的中文句子用来验证它不会被错误地加粗处理因为它远远超过了单个词的长度上限应该被跳过";
    expect(cjk.length).toBeGreaterThan(MAX_TOKEN_LETTERS);
    expect(boldLength(cjk, OPTIONS)).toBe(0);
    expect(emphasize(cjk, OPTIONS)).toBeNull();

    const hash = "a".repeat(MAX_TOKEN_LETTERS + 1);
    expect(boldLength(hash, OPTIONS)).toBe(0);
    expect(isUnbreakableToken(hash, hash.length)).toBeTrue();
  });

  test("still emphasizes ordinary long words at or below the cap", () => {
    const word = "a".repeat(MAX_TOKEN_LETTERS);
    expect(boldLength(word, OPTIONS)).toBeGreaterThan(0);
  });

  test("isUnbreakableToken classifies urls, emails and long runs", () => {
    expect(isUnbreakableToken("https://x.com", 13)).toBeTrue();
    expect(isUnbreakableToken("a".repeat(41), 41)).toBeTrue();
    expect(isUnbreakableToken("hello", 5)).toBeFalse();
  });

  test("hyphenated and punctuated words are still transformed", () => {
    expect(boldLength("well-known", OPTIONS)).toBeGreaterThan(0);
    expect(boldLength("(parenthetical)", OPTIONS)).toBeGreaterThan(0);
    expect(boldLength('"quoted"', OPTIONS)).toBeGreaterThan(0);
  });

  test("emphasize keeps quotes and brackets outside the core intact", () => {
    const split = emphasize('"(hello)"', OPTIONS);
    expect(split).not.toBeNull();
    expect(split!.head + split!.tail).toBe('"(hello)"');
    expect(split!.head.startsWith('"(')).toBeTrue();
  });
});

describe("rules: parseRule", () => {
  const FALLBACK: RuleSpec = { highLightCommon: false, counts: [0, 1, 1, 2], fraction: 0.4 };

  test("reads the canonical default", () => {
    expect(parseRule(DEFAULT_RULE)).toEqual(FALLBACK);
    expect(parseRule("0 1 1 2 0.4")).toEqual(FALLBACK);
  });

  test("handles the leading sign, attached or detached", () => {
    expect(parseRule("+0 1 1 2 0.4").highLightCommon).toBeTrue();
    expect(parseRule("-0 1 1 2 0.4").highLightCommon).toBeFalse();
    expect(parseRule("+ 0 1 1 2 0.4").highLightCommon).toBeTrue();
    expect(parseRule("- 0 1 1 2 0.4").highLightCommon).toBeFalse();
    expect(parseRule("0 1 1 2 0.4").highLightCommon).toBeFalse();
  });

  test("accepts fewer counts than four and a bare '.5' fraction", () => {
    expect(parseRule("1 0.4")).toEqual({ highLightCommon: false, counts: [1], fraction: 0.4 });
    expect(parseRule("1 2 0.5").counts).toEqual([1, 2]);
    expect(parseRule("0 1 1 2 .5").fraction).toBe(0.5);
  });

  test("invalid input falls back to DEFAULT_RULE without throwing", () => {
    const bad = [
      "",
      "   ",
      "garbage",
      "0 1 1 2",
      "0 x 1 2 0.4",
      "0.5 0.4",
      "+-",
      "1 2 3 4 5 6",
      "0 1 1 2 1",
      "a b c",
    ];
    for (const rule of bad) {
      expect(parseRule(rule)).toEqual(FALLBACK);
    }
    expect(() => parseRule("anything at all")).not.toThrow();
  });

  test("non-string input falls back", () => {
    expect(parseRule(undefined as unknown as string)).toEqual(FALLBACK);
    expect(parseRule(42 as unknown as string)).toEqual(FALLBACK);
  });
});

describe("settings: sanitizeSettings", () => {
  test("defaults are valid and stable", () => {
    expect(sanitizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  test("clamps intensity to [0.2, 0.9]", () => {
    expect(sanitizeSettings({ intensity: 0 }).intensity).toBe(0.2);
    expect(sanitizeSettings({ intensity: 5 }).intensity).toBe(0.9);
    expect(sanitizeSettings({ intensity: 0.5 }).intensity).toBe(0.5);
    expect(sanitizeSettings({ intensity: Number.NaN }).intensity).toBe(0.2);
  });

  test("rounds and clamps minWordLength to [2, 8]", () => {
    expect(sanitizeSettings({ minWordLength: 1 }).minWordLength).toBe(2);
    expect(sanitizeSettings({ minWordLength: 99 }).minWordLength).toBe(8);
    expect(sanitizeSettings({ minWordLength: 3.6 }).minWordLength).toBe(4);
  });

  test("rounds and clamps boldWeight to [500, 900]", () => {
    expect(sanitizeSettings({ boldWeight: 100 }).boldWeight).toBe(500);
    expect(sanitizeSettings({ boldWeight: 5000 }).boldWeight).toBe(900);
    expect(sanitizeSettings({ boldWeight: 702.4 }).boldWeight).toBe(702);
  });

  test("clamps restOpacity to [0.4, 1]", () => {
    expect(sanitizeSettings({ restOpacity: 0 }).restOpacity).toBe(0.4);
    expect(sanitizeSettings({ restOpacity: 2 }).restOpacity).toBe(1);
  });

  test("unknown modes fall back and the version stays pinned", () => {
    expect(sanitizeSettings({ mode: "nope" as never }).mode).toBe(DEFAULT_SETTINGS.mode);
    expect(sanitizeSettings({ mode: "dim" }).mode).toBe("dim");
    expect(sanitizeSettings({ version: 99 as never }).version).toBe(SETTINGS_VERSION);
  });

  test("filters malformed site rules and clamps their fields", () => {
    const s = sanitizeSettings({
      sites: [
        { pattern: "https://example.com/*", enabled: true, intensity: 5, mode: "dim" },
        { pattern: 123 as never, enabled: true },
        { enabled: false } as never,
      ] as never,
    });
    expect(s.sites).toHaveLength(1);
    expect(s.sites[0]).toEqual({
      pattern: "https://example.com/*",
      enabled: true,
      mode: "dim",
      intensity: 0.9,
    });
  });

  test("drops non-string rule and custom vowels", () => {
    const s = sanitizeSettings({ rule: 5 as never, customVowels: null as never });
    expect(s.rule).toBe(DEFAULT_SETTINGS.rule);
    expect(s.customVowels).toBe("");
  });

  test("is idempotent", () => {
    const once = sanitizeSettings({ intensity: 9, minWordLength: -1, sites: [] });
    expect(sanitizeSettings(once)).toEqual(once);
  });
});
