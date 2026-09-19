/**
 * Shared contract for bionic-page. Every module (core, content, popup,
 * options, background) depends on this file and nothing else cross-module.
 * Keep it dependency-free so it can be bundled into any context.
 */

/** Reading modes. Each mode is a different way of deciding what to emphasize. */
export type ModeId =
  /** Bold the first `ceil(length * intensity)` characters, min 1. */
  | "classic"
  /** Bold exactly the first half of the word (Bionic-Reading default). */
  | "half"
  /** Anchor emphasis to the first vowel group (language friendly). */
  | "vowel"
  /** Bold prefix, then fade the remainder (low-distraction reading). */
  | "dim"
  /** Per-length counts + a fraction for the rest, e.g. "0 1 1 2 0.4". */
  | "rules";

export const MODE_IDS: readonly ModeId[] = ["classic", "half", "vowel", "dim", "rules"];

export interface ModeInfo {
  id: ModeId;
  label: string;
  description: string;
}

export const MODES: readonly ModeInfo[] = [
  { id: "classic", label: "Classic", description: "Bold a leading share of each word; intensity controls how much." },
  { id: "half", label: "Half", description: "Bold the first half of each word, the Bionic Reading default." },
  { id: "vowel", label: "Vowel anchor", description: "Bold up to the first vowel group; suited to many languages." },
  { id: "dim", label: "Low distraction", description: "Bold the prefix and fade the rest of the word." },
  { id: "rules", label: "Custom rule", description: "Per-length character counts plus a fraction for longer words." },
];

/** A per-site override. Patterns are match patterns, e.g. "https://news.ycombinator.com/*". */
export interface SiteRule {
  /** Match pattern (Chrome/Firefox `*://host/path` syntax). */
  pattern: string;
  /** Whether bionic reading is on for this site. */
  enabled: boolean;
  /** Optional per-site mode; falls back to the global mode when absent. */
  mode?: ModeId;
  /** Optional per-site intensity in [0,1]; falls back to the global value. */
  intensity?: number;
  /** Free-form label shown in the options UI. */
  label?: string;
}

export interface Settings {
  version: 1;
  /** Master switch. When false, nothing is transformed anywhere. */
  enabled: boolean;
  mode: ModeId;
  /** Fraction of a word to emphasize in [0.2, 0.9]; clamped by core. */
  intensity: number;
  /** Words shorter than this are never transformed (2..8). */
  minWordLength: number;
  /** Skip a small built-in list of very common short words. */
  skipCommonWords: boolean;
  /** If a word is already inside <b>/<strong>, leave it alone. */
  respectExistingBold: boolean;
  /** Font weight used for emphasis (500..900). */
  boldWeight: number;
  /** In "dim" mode, opacity applied to the non-emphasized part (0.4..1). */
  restOpacity: number;
  /** Add a touch of letter-spacing after the emphasized prefix. */
  letterSpacing: boolean;
  /** Advanced per-length rule for "rules" mode: "0 1 1 2 0.4" (see core/rules.ts). */
  rule: string;
  /** Language-specific vowel characters for "vowel" mode; empty uses the default set. */
  customVowels: string;
  /** Re-process content added after load (SPAs, infinite scroll). */
  processDynamic: boolean;
  /** Run inside same-origin iframes. */
  processIframes: boolean;
  /** Render a small floating control on the page. */
  showFloatingControl: boolean;
  /** Per-site overrides, evaluated last match wins. */
  sites: SiteRule[];
}

export const SETTINGS_VERSION = 1 as const;

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  enabled: true,
  mode: "half",
  intensity: 0.5,
  minWordLength: 3,
  skipCommonWords: false,
  respectExistingBold: true,
  boldWeight: 700,
  restOpacity: 0.72,
  letterSpacing: false,
  rule: "0 1 1 2 0.4",
  customVowels: "",
  processDynamic: true,
  processIframes: true,
  showFloatingControl: true,
  sites: [],
};

/** The runtime state a content script reports back to popup/background. */
export interface PageState {
  /** Whether bionic reading is currently applied to this tab. */
  active: boolean;
  /** Whether the tab is enabled by global + site rules (before per-tab toggle). */
  enabledByRules: boolean;
  /** Number of text nodes transformed in the last pass. */
  transformedNodes: number;
  /** Resolved settings for this tab (global merged with the matching site rule). */
  settings: Settings;
  /** True when no WebExtension APIs are available (tests / plain page). */
  degraded: boolean;
}

/** Messages exchanged between popup/options/background/content. */
export type Message =
  | { type: "get-state" }
  | { type: "state"; state: PageState }
  | { type: "apply" }
  | { type: "remove" }
  | { type: "toggle" }
  | { type: "settings-changed"; settings: Settings }
  | { type: "refresh" }
  | { type: "badge"; active: boolean };

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Returns a copy of settings with every field clamped to its valid range. */
export function sanitizeSettings(input: Partial<Settings> | undefined | null): Settings {
  const base: Settings = { ...DEFAULT_SETTINGS, ...(input ?? {}) };
  const sites = Array.isArray(base.sites) ? base.sites.filter((s) => s && typeof s.pattern === "string") : [];
  return {
    ...base,
    version: SETTINGS_VERSION,
    enabled: Boolean(base.enabled),
    mode: MODE_IDS.includes(base.mode) ? base.mode : DEFAULT_SETTINGS.mode,
    intensity: clamp(Number(base.intensity), 0.2, 0.9),
    minWordLength: Math.round(clamp(Number(base.minWordLength), 2, 8)),
    boldWeight: Math.round(clamp(Number(base.boldWeight), 500, 900)),
    restOpacity: clamp(Number(base.restOpacity), 0.4, 1),
    rule: typeof base.rule === "string" ? base.rule : DEFAULT_SETTINGS.rule,
    customVowels: typeof base.customVowels === "string" ? base.customVowels : "",
    sites: sites.map((s) => ({
      pattern: s.pattern,
      enabled: Boolean(s.enabled),
      ...(s.mode && MODE_IDS.includes(s.mode) ? { mode: s.mode } : {}),
      ...(typeof s.intensity === "number" ? { intensity: clamp(s.intensity, 0.2, 0.9) } : {}),
      ...(typeof s.label === "string" ? { label: s.label } : {}),
    })),
  };
}
