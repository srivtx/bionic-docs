import { DEFAULT_SETTINGS, MODES, sanitizeSettings } from "../shared/types";
import type { Settings } from "../shared/types";
import { loadSettings, onSettingsChanged, saveSettings } from "../shared/storage";
import { api, call } from "../shared/browser";
import { emphasize } from "../core/algorithm";
import type { BionicOptions } from "../core/algorithm";

const PREVIEW_TEXT =
  "Bionic reading anchors your attention to the start of each word, so long documents feel lighter and your eyes move with less effort.";

function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(id) as T | null;
}

let settings: Settings | null = null;

function send(message: unknown): Promise<unknown> {
  const runtime = api?.runtime;
  if (!runtime?.sendMessage) return Promise.resolve(undefined);
  return call(runtime.sendMessage, runtime, message).catch(() => undefined);
}

function note(message: string): void {
  const el = $("note");
  if (el) el.textContent = message;
}

function optionsFor(value: Settings): BionicOptions {
  return {
    mode: value.mode,
    intensity: value.intensity,
    minWordLength: value.minWordLength,
    skipCommonWords: value.skipCommonWords,
    rule: value.rule,
    customVowels: value.customVowels,
  };
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const options = select.options;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option) option.selected = option.value === value;
  }
}

function readSelectValue(select: HTMLSelectElement): string {
  const option = select.options[select.selectedIndex];
  return option ? option.value : "";
}

function populateModes(): void {
  const mode = $<HTMLSelectElement>("mode");
  if (!mode) return;
  mode.textContent = "";
  for (const entry of MODES) {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.label;
    option.title = entry.description;
    mode.appendChild(option);
  }
}

function renderValues(): void {
  const intensity = $<HTMLInputElement>("intensity");
  const intensityValue = $("intensityValue");
  if (intensityValue) {
    intensityValue.textContent = `${Math.round(Number(intensity?.value ?? settings?.intensity ?? 0.5) * 100)}%`;
  }

  const weight = $<HTMLInputElement>("boldWeight");
  const weightValue = $("boldWeightValue");
  if (weightValue) {
    weightValue.textContent = String(Math.round(Number(weight?.value ?? settings?.boldWeight ?? 700)));
  }

  const opacity = $<HTMLInputElement>("restOpacity");
  const opacityValue = $("restOpacityValue");
  if (opacityValue) {
    opacityValue.textContent = `${Math.round(Number(opacity?.value ?? settings?.restOpacity ?? 0.72) * 100)}%`;
  }
}

function renderPreview(): void {
  const host = $("preview");
  if (!host || !settings) return;
  const options = optionsFor(settings);
  host.textContent = "";
  for (const part of PREVIEW_TEXT.split(/(\s+)/)) {
    if (part.length === 0) continue;
    if (/^\s+$/.test(part)) {
      host.appendChild(document.createTextNode(part));
      continue;
    }
    const split = emphasize(part, options);
    if (split === null) {
      host.appendChild(document.createTextNode(part));
      continue;
    }
    const head = document.createElement("b");
    head.textContent = split.head;
    head.style.fontWeight = String(settings.boldWeight);
    if (settings.letterSpacing) head.style.letterSpacing = "0.04em";
    host.appendChild(head);
    host.appendChild(document.createTextNode(split.tail));
  }
}

function renderForm(): void {
  if (!settings) return;
  const enabled = $<HTMLInputElement>("enabled");
  if (enabled) enabled.checked = settings.enabled;
  const mode = $<HTMLSelectElement>("mode");
  if (mode) setSelectValue(mode, settings.mode);
  const intensity = $<HTMLInputElement>("intensity");
  if (intensity) intensity.value = String(settings.intensity);
  const min = $<HTMLInputElement>("minWordLength");
  if (min) min.value = String(settings.minWordLength);
  const skip = $<HTMLInputElement>("skipCommonWords");
  if (skip) skip.checked = settings.skipCommonWords;
  const respect = $<HTMLInputElement>("respectExistingBold");
  if (respect) respect.checked = settings.respectExistingBold;
  const weight = $<HTMLInputElement>("boldWeight");
  if (weight) weight.value = String(settings.boldWeight);
  const opacity = $<HTMLInputElement>("restOpacity");
  if (opacity) opacity.value = String(settings.restOpacity);
  const spacing = $<HTMLInputElement>("letterSpacing");
  if (spacing) spacing.checked = settings.letterSpacing;
  const rule = $<HTMLInputElement>("rule");
  if (rule) rule.value = settings.rule;
  const vowels = $<HTMLInputElement>("customVowels");
  if (vowels) vowels.value = settings.customVowels;
  renderValues();
  renderPreview();
}

function apply(next: Settings): void {
  settings = next;
  renderForm();
}

function commit(patch: Partial<Settings>): void {
  if (!settings) return;
  const next = sanitizeSettings({ ...settings, ...patch });
  const changed = JSON.stringify(next) !== JSON.stringify(settings);
  settings = next;
  renderValues();
  renderPreview();
  if (!changed) return;
  void saveSettings(next);
  void send({ type: "settings-changed", settings: next });
  note("Saved.");
}

function exportJson(): void {
  if (!settings) return;
  try {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bionic-docs-settings.json";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    note("Exported settings JSON.");
  } catch {
    note("Could not export settings in this context.");
  }
}

function importJson(file: File): void {
  if (typeof FileReader === "undefined") {
    note("Import is unavailable in this context.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = typeof reader.result === "string" ? reader.result : "";
      const parsed = JSON.parse(text) as Partial<Settings> | null;
      const next = sanitizeSettings(parsed);
      apply(next);
      void saveSettings(next);
      void send({ type: "settings-changed", settings: next });
      note("Imported settings.");
    } catch {
      note("That file is not valid settings JSON.");
    }
  };
  reader.onerror = () => note("Could not read that file.");
  reader.readAsText(file);
}

function bind(): void {
  const enabled = $<HTMLInputElement>("enabled");
  enabled?.addEventListener("change", () => commit({ enabled: Boolean(enabled.checked) }));

  const mode = $<HTMLSelectElement>("mode");
  mode?.addEventListener("change", () => {
    const value = readSelectValue(mode) as Settings["mode"];
    if (MODES.some((entry) => entry.id === value)) commit({ mode: value });
  });

  const intensity = $<HTMLInputElement>("intensity");
  intensity?.addEventListener("input", () => {
    const value = Number(intensity.value);
    if (!Number.isFinite(value)) return;
    renderValues();
    commit({ intensity: value });
  });

  const min = $<HTMLInputElement>("minWordLength");
  min?.addEventListener("input", () => {
    const value = Number(min.value);
    if (!Number.isFinite(value) || value <= 0) return;
    commit({ minWordLength: value });
  });
  min?.addEventListener("change", () => renderForm());

  const skip = $<HTMLInputElement>("skipCommonWords");
  skip?.addEventListener("change", () => commit({ skipCommonWords: Boolean(skip.checked) }));

  const respect = $<HTMLInputElement>("respectExistingBold");
  respect?.addEventListener("change", () => commit({ respectExistingBold: Boolean(respect.checked) }));

  const weight = $<HTMLInputElement>("boldWeight");
  weight?.addEventListener("input", () => {
    const value = Number(weight.value);
    if (!Number.isFinite(value)) return;
    renderValues();
    commit({ boldWeight: value });
  });

  const opacity = $<HTMLInputElement>("restOpacity");
  opacity?.addEventListener("input", () => {
    const value = Number(opacity.value);
    if (!Number.isFinite(value)) return;
    renderValues();
    commit({ restOpacity: value });
  });

  const spacing = $<HTMLInputElement>("letterSpacing");
  spacing?.addEventListener("change", () => commit({ letterSpacing: Boolean(spacing.checked) }));

  const rule = $<HTMLInputElement>("rule");
  rule?.addEventListener("input", () => commit({ rule: rule.value }));

  const vowels = $<HTMLInputElement>("customVowels");
  vowels?.addEventListener("input", () => commit({ customVowels: vowels.value }));

  const reset = $<HTMLButtonElement>("reset");
  reset?.addEventListener("click", () => {
    const defaults = sanitizeSettings(DEFAULT_SETTINGS);
    apply(defaults);
    void saveSettings(defaults);
    void send({ type: "settings-changed", settings: defaults });
    note("Reset to defaults.");
  });

  const exportButton = $<HTMLButtonElement>("export");
  exportButton?.addEventListener("click", exportJson);

  const importInput = $<HTMLInputElement>("importFile");
  importInput?.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (file) importJson(file);
    importInput.value = "";
  });
}

async function init(): Promise<void> {
  populateModes();
  bind();
  apply(await loadSettings());
}

onSettingsChanged((next) => {
  if (JSON.stringify(next) === JSON.stringify(settings)) return;
  apply(next);
  note("Updated from another page.");
});

void init();
