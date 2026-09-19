import { api } from "../shared/browser";
import { loadSettings, onSettingsChanged, saveSettings } from "../shared/storage";
import { DEFAULT_SETTINGS, MODES, sanitizeSettings, type Settings } from "../shared/types";
import type { BionicOptions } from "../core/algorithm";
import { openEpub, type EpubHandle } from "../epub/epub";
import { openPdf, setPdfWorkerSrc, type PdfHandle } from "../pdf/pdf";

type DocKind = "pdf" | "epub";

let settings: Settings = sanitizeSettings(DEFAULT_SETTINGS);
let pdf: PdfHandle | null = null;
let epub: EpubHandle | null = null;
let kind: DocKind | null = null;
let busy = false;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}
function $input(id: string): HTMLInputElement | null {
  return document.getElementById(id) as HTMLInputElement | null;
}
function $select(id: string): HTMLSelectElement | null {
  return document.getElementById(id) as HTMLSelectElement | null;
}

function toOptions(s: Settings): BionicOptions {
  return {
    mode: s.mode,
    intensity: s.intensity,
    minWordLength: s.minWordLength,
    skipCommonWords: s.skipCommonWords,
    rule: s.rule,
    customVowels: s.customVowels,
  };
}

function workerSrc(): string {
  try {
    if (api?.runtime?.getURL) return api.runtime.getURL("pdf.worker.min.mjs");
  } catch {
    /* ignore */
  }
  return "pdf.worker.min.mjs";
}

function setStatus(text: string): void {
  const status = $("status");
  if (status) status.textContent = text;
}

function setPosition(text: string): void {
  const position = $("position");
  if (position) position.textContent = text;
}

function setDropzone(visible: boolean): void {
  const dropzone = $("dropzone");
  if (dropzone) dropzone.hidden = !visible;
}

function sniff(buffer: ArrayBuffer): DocKind | null {
  const bytes = new Uint8Array(buffer.slice(0, 5));
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "epub";
  return null;
}

function destroyCurrent(): void {
  try {
    pdf?.destroy();
  } catch {
    /* ignore */
  }
  try {
    epub?.destroy();
  } catch {
    /* ignore */
  }
  pdf = null;
  epub = null;
  kind = null;
}

function updatePosition(): void {
  if (kind === "pdf" && pdf) {
    const total = pdf.pageCount;
    setPosition(`PDF · ${total} page${total === 1 ? "" : "s"}`);
    return;
  }
  if (kind === "epub" && epub) {
    setPosition(`${epub.currentIndex() + 1} / ${epub.chapterCount}`);
    return;
  }
  setPosition("No document");
}

async function openBuffer(buffer: ArrayBuffer, name: string): Promise<void> {
  const doc = $("doc");
  if (!doc) return;
  const detected = sniff(buffer);
  if (!detected) {
    setStatus(`${name || "That file"} is not a PDF or EPUB.`);
    return;
  }
  destroyCurrent();
  busy = true;
  setStatus(`Opening ${name || detected.toUpperCase()}…`);
  try {
    if (detected === "pdf") {
      setPdfWorkerSrc(workerSrc());
      pdf = await openPdf(buffer, doc, toOptions(settings));
      kind = "pdf";
    } else {
      epub = await openEpub(buffer, doc, toOptions(settings));
      kind = "epub";
    }
    setDropzone(false);
    setStatus("");
    updatePosition();
  } catch (error) {
    destroyCurrent();
    setDropzone(true);
    setStatus(`Could not open ${name || "the file"}: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally {
    busy = false;
  }
}

async function openFile(file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  await openBuffer(buffer, file.name);
}

async function openUrl(src: string): Promise<void> {
  try {
    setStatus("Downloading document…");
    const response = await fetch(src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const name = src.split("/").pop() ?? "";
    await openBuffer(buffer, name);
  } catch (error) {
    setDropzone(true);
    setStatus(`Could not load ${src}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

function applyOptions(): void {
  try {
    const options = toOptions(settings);
    pdf?.setOptions(options);
    epub?.setOptions(options);
  } catch {
    /* ignore */
  }
}

function populateModes(): void {
  const mode = $select("mode");
  if (!mode) return;
  mode.textContent = "";
  for (const info of MODES) {
    const option = document.createElement("option");
    option.value = info.id;
    option.textContent = info.label;
    option.title = info.description;
    mode.appendChild(option);
  }
}

function syncControls(): void {
  const mode = $select("mode");
  if (mode) mode.value = settings.mode;
  const intensity = $input("intensity");
  if (intensity) intensity.value = String(settings.intensity);
  const output = $("intensityValue");
  if (output) output.textContent = `${Math.round(settings.intensity * 100)}%`;
}

async function updateSettings(patch: Partial<Settings>): Promise<void> {
  settings = sanitizeSettings({ ...settings, ...patch });
  await saveSettings(settings);
  applyOptions();
  syncControls();
}

function step(direction: 1 | -1): void {
  if (kind === "epub" && epub) {
    epub.goToIndex(epub.currentIndex() + direction);
    updatePosition();
    return;
  }
  if (kind === "pdf") {
    const pages = Array.from(document.querySelectorAll<HTMLElement>(".pdf-page"));
    if (pages.length === 0) return;
    const top = window.scrollY;
    let target = pages[0];
    for (const page of pages) {
      if (direction === 1 ? page.offsetTop > top + 8 : page.offsetTop < top - 8) {
        target = page;
        if (direction === 1) break;
      }
    }
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function wire(): void {
  populateModes();
  syncControls();

  $("openFile")?.addEventListener("click", () => $input("file")?.click());
  $("pickFile")?.addEventListener("click", () => $input("file")?.click());
  $input("file")?.addEventListener("change", () => {
    const file = $input("file")?.files?.[0];
    if (file) void openFile(file);
  });

  $("prev")?.addEventListener("click", () => step(-1));
  $("next")?.addEventListener("click", () => step(1));

  $select("mode")?.addEventListener("change", () => {
    void updateSettings({ mode: $select("mode")?.value as Settings["mode"] });
  });
  $input("intensity")?.addEventListener("input", () => {
    const value = Number($input("intensity")?.value ?? "0.5");
    const output = $("intensityValue");
    if (output) output.textContent = `${Math.round(value * 100)}%`;
  });
  $input("intensity")?.addEventListener("change", () => {
    void updateSettings({ intensity: Number($input("intensity")?.value ?? "0.5") });
  });

  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    document.body.classList.add("dragging");
  });
  window.addEventListener("dragleave", () => document.body.classList.remove("dragging"));
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    document.body.classList.remove("dragging");
    const file = event.dataTransfer?.files?.[0];
    if (file) void openFile(file);
  });
}

async function init(): Promise<void> {
  wire();
  try {
    settings = await loadSettings();
    syncControls();
  } catch {
    /* defaults are fine */
  }

  onSettingsChanged((next) => {
    settings = next;
    applyOptions();
    syncControls();
  });

  const params = new URLSearchParams(location.search);
  const src = params.get("src");
  if (src) void openUrl(src);
  else if (params.get("pick") === "1") $input("file")?.click();
  else setDropzone(true);
}

// Debug handle used by scripts/e2e.mjs.
try {
  (globalThis as Record<string, unknown>).__docs = {
    openBuffer,
    kind: () => kind,
    isBusy: () => busy,
    position: () => $("position")?.textContent ?? "",
  };
} catch {
  /* ignore */
}

void init();
