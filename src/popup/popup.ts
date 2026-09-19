import { MODES, sanitizeSettings } from "../shared/types";
import type { PageState, Settings } from "../shared/types";
import { loadSettings, onSettingsChanged, saveSettings } from "../shared/storage";
import { api, call } from "../shared/browser";

function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(id) as T | null;
}

let settings: Settings | null = null;

function setStatus(message: string): void {
  const status = $("status");
  if (status) status.textContent = message;
}

function send(message: unknown): Promise<unknown> {
  const runtime = api?.runtime;
  if (!runtime?.sendMessage) return Promise.resolve(undefined);
  return call(runtime.sendMessage, runtime, message).catch(() => undefined);
}

function openPage(url: string): void {
  try {
    if (typeof window !== "undefined") window.open(url, "_blank");
  } catch {
    /* ignore */
  }
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

function renderIntensity(): void {
  const range = $<HTMLInputElement>("intensity");
  const output = $("intensityValue");
  const value = Number(range?.value ?? settings?.intensity ?? 0.5);
  if (output) output.textContent = `${Math.round(value * 100)}%`;
}

function render(next: Settings): void {
  settings = next;
  const enabled = $<HTMLInputElement>("enabled");
  if (enabled) enabled.checked = next.enabled;
  const mode = $<HTMLSelectElement>("mode");
  if (mode) setSelectValue(mode, next.mode);
  const intensity = $<HTMLInputElement>("intensity");
  if (intensity) intensity.value = String(next.intensity);
  const min = $<HTMLInputElement>("minWordLength");
  if (min) min.value = String(next.minWordLength);
  renderIntensity();
}

function commit(patch: Partial<Settings>): void {
  if (!settings) return;
  const next = sanitizeSettings({ ...settings, ...patch });
  settings = next;
  renderIntensity();
  void saveSettings(next);
  void send({ type: "settings-changed", settings: next });
}

function renderState(raw: unknown): void {
  let value: unknown = raw;
  if (raw && typeof raw === "object" && "state" in raw) {
    value = (raw as { state?: unknown }).state;
  }
  const state = value as Partial<PageState> | null | undefined;
  if (!state || typeof state !== "object" || state.degraded) {
    setStatus("Open a PDF or EPUB to begin.");
    return;
  }
  if (state.active) {
    const count = typeof state.transformedNodes === "number" ? state.transformedNodes : 0;
    setStatus(`Bionic reading is on · ${count} passage${count === 1 ? "" : "s"} emphasized`);
    return;
  }
  if (state.enabledByRules === false) {
    setStatus("Bionic reading is off for this document.");
    return;
  }
  setStatus("Open a PDF or EPUB to begin.");
}

async function refreshState(): Promise<void> {
  const runtime = api?.runtime;
  if (!runtime?.sendMessage) {
    setStatus("Open a PDF or EPUB to begin.");
    return;
  }
  const response = await send({ type: "get-state" });
  renderState(response);
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
    renderIntensity();
    commit({ intensity: value });
  });

  const min = $<HTMLInputElement>("minWordLength");
  min?.addEventListener("input", () => {
    const value = Number(min.value);
    if (!Number.isFinite(value) || value <= 0) return;
    commit({ minWordLength: value });
  });
  min?.addEventListener("change", () => {
    if (settings) min.value = String(settings.minWordLength);
  });

  const openCurrent = $<HTMLButtonElement>("openCurrent");
  openCurrent?.addEventListener("click", () => {
    const runtime = api?.runtime;
    if (runtime?.sendMessage) {
      void send({ type: "open-current" });
    } else {
      openPage("reader.html");
    }
  });

  const openFile = $<HTMLButtonElement>("openFile");
  openFile?.addEventListener("click", () => openPage("reader.html?pick=1"));

  const openOptions = $<HTMLButtonElement>("openOptions");
  openOptions?.addEventListener("click", () => {
    const runtime = api?.runtime;
    if (runtime && typeof runtime.openOptionsPage === "function") {
      try {
        runtime.openOptionsPage();
        return;
      } catch {
        /* fall through to a plain window */
      }
    }
    openPage("options.html");
  });
}

async function init(): Promise<void> {
  populateModes();
  bind();
  const loaded = await loadSettings();
  render(loaded);
  await refreshState();
}

onSettingsChanged((next) => {
  if (JSON.stringify(next) === JSON.stringify(settings)) return;
  render(next);
});

void init();
