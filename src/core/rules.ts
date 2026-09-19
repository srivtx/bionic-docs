/**
 * Parser for the `rules` reading mode.
 *
 * Format: optional leading `+`/`-` controlling common-word handling, then up
 * to four non-negative integers (emphasized counts for word lengths 1..4),
 * then a decimal fraction used for words of length >= 5.
 *
 * Invalid input falls back to DEFAULT_RULE without throwing.
 */

export interface RuleSpec {
  highLightCommon: boolean;
  counts: number[];
  fraction: number;
}

export const DEFAULT_RULE = "0 1 1 2 0.4";

function defaultSpec(): RuleSpec {
  return { highLightCommon: false, counts: [0, 1, 1, 2], fraction: 0.4 };
}

const INTEGER_RE = /^\d+$/;
const FRACTION_RE = /^\d*\.\d+$/;

export function parseRule(rule: string): RuleSpec {
  if (typeof rule !== "string") return defaultSpec();

  let text = rule.trim();
  if (text.length === 0) return defaultSpec();

  let highLightCommon = false;
  const sign = text[0];
  if (sign === "+" || sign === "-") {
    highLightCommon = sign === "+";
    text = text.slice(1).trim();
  }
  if (text.length === 0) return defaultSpec();

  const tokens = text.split(/\s+/);
  if (tokens.length < 1 || tokens.length > 5) return defaultSpec();

  const last = tokens[tokens.length - 1]!;
  if (!FRACTION_RE.test(last)) return defaultSpec();
  const fraction = Number(last);
  if (!Number.isFinite(fraction)) return defaultSpec();

  const counts: number[] = [];
  for (const token of tokens.slice(0, -1)) {
    if (!INTEGER_RE.test(token)) return defaultSpec();
    counts.push(Number(token));
  }

  return { highLightCommon, counts, fraction };
}
