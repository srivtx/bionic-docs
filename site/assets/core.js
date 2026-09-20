/* bionic core — compiled from src/core/*.ts by scripts/build-demo.mjs. The same code the extension runs. */
var BionicCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // demo-entry.ts
  var demo_entry_exports = {};
  __export(demo_entry_exports, {
    COMMON_WORDS: () => COMMON_WORDS,
    CORE_PACKAGE_VERSION: () => CORE_PACKAGE_VERSION,
    DEFAULT_RULE: () => DEFAULT_RULE,
    DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
    DEFAULT_VOWELS: () => DEFAULT_VOWELS,
    MAX_TOKEN_LETTERS: () => MAX_TOKEN_LETTERS,
    MODES: () => MODES,
    MODE_IDS: () => MODE_IDS,
    SETTINGS_VERSION: () => SETTINGS_VERSION,
    bionicHtml: () => bionicHtml,
    bionicText: () => bionicText,
    boldLength: () => boldLength,
    clamp: () => clamp,
    countWords: () => countWords,
    emphasize: () => emphasize,
    isLetter: () => isLetter,
    paint: () => paint,
    parseRule: () => parseRule,
    sanitizeSettings: () => sanitizeSettings,
    splitAffixes: () => splitAffixes
  });

  // src/core/languages.ts
  var DEFAULT_VOWELS = "aeiouy\xE0\xE1\xE2\xE3\xE4\xE5\u0101\u0103\u0105\u01DF\u01E1\u01FB\u0201\u0203\xE8\xE9\xEA\xEB\u0113\u0115\u0117\u0119\u011B\u0205\u0207\xEC\xED\xEE\xEF\u0129\u012B\u012D\u012F\u0131\u0209\u020B\xF2\xF3\xF4\xF5\xF6\xF8\u014D\u014F\u0151\u020D\u020F\xF9\xFA\xFB\xFC\u0169\u016B\u016D\u016F\u0171\u0173\u0215\u0217\u01D6\u01D8\u01DA\u01DC\u1EF3\xFD\u0177\xFF\u1EF9\u1EF5";
  var COMMON_WORD_LIST = "a an and the of to in is it on at by or as be if so we he she i you my me us do go no up out not but for with from this that they them their there here was were are am has have has had will would can could should may might must shall than then when where which who whom whose what why how all any some one two its our your his her him";
  var COMMON_WORDS = new Set(COMMON_WORD_LIST.split(/\s+/));
  var LETTER_OR_MARK = /[\p{L}\p{M}]/u;
  function isLetter(ch) {
    if (ch.length === 0) return false;
    const cp = ch.codePointAt(0);
    if (cp === void 0) return false;
    return LETTER_OR_MARK.test(String.fromCodePoint(cp));
  }
  function splitAffixes(word) {
    const points = Array.from(word);
    let start = 0;
    while (start < points.length && !isLetter(points[start])) start++;
    if (start === points.length) {
      return { prefix: word, core: "", suffix: "" };
    }
    let end = points.length - 1;
    while (end > start && !isLetter(points[end])) end--;
    return {
      prefix: points.slice(0, start).join(""),
      core: points.slice(start, end + 1).join(""),
      suffix: points.slice(end + 1).join("")
    };
  }

  // src/core/rules.ts
  var DEFAULT_RULE = "0 1 1 2 0.4";
  function defaultSpec() {
    return { highLightCommon: false, counts: [0, 1, 1, 2], fraction: 0.4 };
  }
  var INTEGER_RE = /^\d+$/;
  var FRACTION_RE = /^\d*\.\d+$/;
  function parseRule(rule) {
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
    const last = tokens[tokens.length - 1];
    if (!FRACTION_RE.test(last)) return defaultSpec();
    const fraction = Number(last);
    if (!Number.isFinite(fraction)) return defaultSpec();
    const counts = [];
    for (const token of tokens.slice(0, -1)) {
      if (!INTEGER_RE.test(token)) return defaultSpec();
      counts.push(Number(token));
    }
    return { highLightCommon, counts, fraction };
  }

  // src/core/algorithm.ts
  var CORE_PACKAGE_VERSION = "0.1.0";
  function letterCount(text) {
    let count = 0;
    for (const ch of text) {
      if (isLetter(ch)) count++;
    }
    return count;
  }
  function takeLeadingLetters(core, n) {
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
  function vowelSet(customVowels) {
    const source = customVowels.length > 0 ? customVowels : DEFAULT_VOWELS;
    const set = /* @__PURE__ */ new Set();
    for (const ch of source) set.add(ch.toLowerCase());
    return set;
  }
  function vowelGroupLength(core, vowels) {
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
  function ruleLength(letters, spec) {
    if (letters <= 4) {
      const count = spec.counts[letters - 1];
      if (count !== void 0) return count;
    }
    const fraction = Number.isFinite(spec.fraction) ? spec.fraction : 0;
    return Math.ceil(fraction * letters);
  }
  var MAX_TOKEN_LETTERS = 40;
  var URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function isUnbreakableToken(word, letters) {
    if (letters > MAX_TOKEN_LETTERS) return true;
    const trimmed = word.trim();
    if (URL_RE.test(trimmed)) return true;
    if (trimmed.startsWith("www.")) return true;
    return EMAIL_RE.test(trimmed);
  }
  function boldLength(word, options) {
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
    let n;
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
  function emphasize(word, options) {
    const n = boldLength(word, options);
    if (n <= 0) return null;
    const { prefix, core, suffix } = splitAffixes(word);
    const headCore = takeLeadingLetters(core, n);
    if (headCore.length === 0) return null;
    return {
      head: prefix + headCore,
      tail: core.slice(headCore.length) + suffix
    };
  }
  function bionicText(text, options) {
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

  // src/shared/types.ts
  var MODE_IDS = ["classic", "half", "vowel", "dim", "rules"];
  var MODES = [
    { id: "classic", label: "Classic", description: "Bold a leading share of each word; intensity controls how much." },
    { id: "half", label: "Half", description: "Bold the first half of each word, the Bionic Reading default." },
    { id: "vowel", label: "Vowel anchor", description: "Bold up to the first vowel group; suited to many languages." },
    { id: "dim", label: "Low distraction", description: "Bold the prefix and fade the rest of the word." },
    { id: "rules", label: "Custom rule", description: "Per-length character counts plus a fraction for longer words." }
  ];
  var SETTINGS_VERSION = 1;
  var DEFAULT_SETTINGS = {
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
    sites: []
  };
  function clamp(value, min, max) {
    if (Number.isNaN(value)) return min;
    return Math.min(max, Math.max(min, value));
  }
  function sanitizeSettings(input) {
    const base = { ...DEFAULT_SETTINGS, ...input ?? {} };
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
        ...s.mode && MODE_IDS.includes(s.mode) ? { mode: s.mode } : {},
        ...typeof s.intensity === "number" ? { intensity: clamp(s.intensity, 0.2, 0.9) } : {},
        ...typeof s.label === "string" ? { label: s.label } : {}
      }))
    };
  }

  // demo-entry.ts
  var ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  function escapeHtml(text) {
    return text.replace(/[&<>]/g, (ch) => ESCAPES[ch]);
  }
  function bionicHtml(text, options) {
    const dim = options.mode === "dim";
    let out = "";
    for (const part of String(text).split(/(\s+)/)) {
      if (part.length === 0) continue;
      if (/^\s+$/.test(part)) {
        out += part;
        continue;
      }
      const split = emphasize(part, options);
      if (split === null) {
        out += escapeHtml(part);
        continue;
      }
      out += '<b class="bp-head">' + escapeHtml(split.head) + "</b>";
      out += dim ? '<span class="bp-tail">' + escapeHtml(split.tail) + "</span>" : escapeHtml(split.tail);
    }
    return out;
  }
  function paint(element, text, options) {
    if (!element) return;
    element.innerHTML = bionicHtml(text, options);
  }
  function countWords(text) {
    const matches = String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
    return matches ? matches.length : 0;
  }
  return __toCommonJS(demo_entry_exports);
})();
