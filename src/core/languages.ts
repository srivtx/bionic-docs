/**
 * Language primitives for the bionic-page core.
 *
 * Pure functions only: no DOM, no globals, no randomness, no clocks.
 * All character handling is code-point aware so accented Latin letters and
 * decomposed (base + combining mark) sequences are treated as letters.
 */

/** Default vowel set: plain ASCII vowels plus accented Latin vowels. */
export const DEFAULT_VOWELS =
  "aeiouy" +
  "àáâãäåāăąǟǡǻȁȃ" +
  "èéêëēĕėęěȅȇ" +
  "ìíîïĩīĭįıȉȋ" +
  "òóôõöøōŏőȍȏ" +
  "ùúûüũūŭůűųȕȗ" +
  "ǖǘǚǜ" +
  "ỳýŷÿỹỵ";

/** Lowercase English function words that most readers do not need bolded. */
const COMMON_WORD_LIST =
  "a an and the of to in is it on at by or as be if so we he she i you my me us " +
  "do go no up out not but for with from this that they them their there here " +
  "was were are am has have has had will would can could should may might must " +
  "shall than then when where which who whom whose what why how all any some " +
  "one two its our your his her him";

export const COMMON_WORDS: ReadonlySet<string> = new Set(COMMON_WORD_LIST.split(/\s+/));

const LETTER_OR_MARK = /[\p{L}\p{M}]/u;

/**
 * Unicode-aware letter test. Returns true for letters (`\p{L}`) and for
 * combining marks (`\p{M}`) so decomposed accents stay attached to their base
 * letter. Only the first code point of `ch` is examined.
 */
export function isLetter(ch: string): boolean {
  if (ch.length === 0) return false;
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  return LETTER_OR_MARK.test(String.fromCodePoint(cp));
}

/**
 * Split a raw token into leading/trailing non-letter runs and the core between
 * them. Quotes, brackets, dashes and ellipses stay in `prefix`/`suffix`.
 */
export function splitAffixes(word: string): { prefix: string; core: string; suffix: string } {
  const points = Array.from(word);
  let start = 0;
  while (start < points.length && !isLetter(points[start]!)) start++;

  if (start === points.length) {
    return { prefix: word, core: "", suffix: "" };
  }

  let end = points.length - 1;
  while (end > start && !isLetter(points[end]!)) end--;

  return {
    prefix: points.slice(0, start).join(""),
    core: points.slice(start, end + 1).join(""),
    suffix: points.slice(end + 1).join(""),
  };
}
