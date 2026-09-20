import { api, call, degraded } from "../shared/browser";
import { getLocal, loadSettings, onSettingsChanged, saveSettings } from "../shared/storage";
import { DEFAULT_SETTINGS, MODES, sanitizeSettings, type Settings } from "../shared/types";
import type { BionicOptions } from "../core/algorithm";
import { openEpub, type EpubHandle } from "../epub/epub";
import { decodeText, dirName, findFileKey, findOpfPath, parseOpf, resolveHref, unzipEpub } from "../epub/parse";
import { openPdf, setPdfWorkerSrc, type PdfHandle } from "../pdf/pdf";
import { navIntent, type FocusLike } from "./keys";
import {
  MAX_REMEMBERED,
  positionKey,
  recallPosition,
  rememberPosition,
  sanitizePositionStore,
  type DocKind,
  type PositionStore,
  type StoredPosition,
} from "./positions";
import { epubTocEntries, pdfTocEntries, type PdfPageSummary, type TocItem } from "./toc";

const POSITIONS_KEY = "bionic-docs:positions";

let settings: Settings = sanitizeSettings(DEFAULT_SETTINGS);
let pdf: PdfHandle | null = null;
let epub: EpubHandle | null = null;
let kind: DocKind | null = null;
let busy = false;

let positionStore: PositionStore = {};
let activeKey: string | null = null;
let pendingResume: StoredPosition | null = null;
let hasNavigated = false;
let currentPdfPage = 0;
let lastBuffer: ArrayBuffer | null = null;

let tocOpen = false;
let tocBuilt = false;
let tocItems: TocItem[] = [];

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

// ── reading position ───────────────────────────────────────────────────────

function storageArea(): any | undefined {
  return api?.storage?.local;
}

async function readPositionStore(): Promise<void> {
  try {
    const raw = await getLocal(POSITIONS_KEY);
    positionStore = sanitizePositionStore(raw, MAX_REMEMBERED);
  } catch {
    positionStore = {};
  }
}

async function writePositionStore(): Promise<void> {
  const area = storageArea();
  if (degraded || !area) return;
  try {
    await call(area.set, area, { [POSITIONS_KEY]: positionStore });
  } catch {
    /* best effort; a full quota must not break reading */
  }
}

function currentIndex(): number {
  if (kind === "epub" && epub) return epub.currentIndex();
  if (kind === "pdf") return currentPdfPage;
  return 0;
}

function lastIndex(): number {
  if (kind === "pdf" && pdf) return Math.max(0, pdf.pageCount - 1);
  if (kind === "epub" && epub) return Math.max(0, epub.chapterCount - 1);
  return 0;
}

function persistCurrentPosition(): void {
  if (!activeKey || !kind) return;
  const index = currentIndex();
  if (!Number.isFinite(index) || index < 0) return;
  if (!hasNavigated && index === 0) return;
  positionStore = rememberPosition(positionStore, activeKey, { kind, index, at: Date.now() }, MAX_REMEMBERED);
  void writePositionStore();
}

function hideResume(): void {
  pendingResume = null;
  const bar = $("resume");
  if (bar) bar.hidden = true;
}

function showResume(position: StoredPosition): void {
  const bar = $("resume");
  const button = $("resumeButton");
  if (!bar || !button) return;
  pendingResume = position;
  const unit = position.kind === "pdf" ? "page" : "chapter";
  button.textContent = `Resume ${unit} ${position.index + 1}`;
  bar.hidden = false;
}

function wireResume(): void {
  $("resumeButton")?.addEventListener("click", () => {
    const position = pendingResume;
    hideResume();
    if (!position || !kind) return;
    hasNavigated = true;
    goToTarget(position.index);
    persistCurrentPosition();
  });
}

// ── table of contents ──────────────────────────────────────────────────────

function resetToc(): void {
  closeToc();
  tocBuilt = false;
  tocItems = [];
  renderToc();
}

function setTocOpen(open: boolean): void {
  tocOpen = open;
  const panel = $("tocPanel");
  const toggle = $("tocToggle");
  if (panel) panel.hidden = !open;
  if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeToc(): void {
  setTocOpen(false);
}

function focusFirstTocEntry(): void {
  const first = $("tocList")?.querySelector<HTMLButtonElement>("button");
  if (first) first.focus();
}

async function openToc(): Promise<void> {
  setTocOpen(true);
  if (!tocBuilt) {
    tocBuilt = true;
    await buildToc();
    renderToc();
  }
  focusFirstTocEntry();
}

function toggleToc(): void {
  if (tocOpen) closeToc();
  else void openToc();
}

async function buildToc(): Promise<void> {
  if (kind === "pdf") {
    tocItems = pdfTocEntries(collectPdfPages());
    return;
  }
  if (kind === "epub" && epub) {
    tocItems = epubTocEntries(epub.toc, await epubChapterPaths());
    return;
  }
  tocItems = [];
}

function collectPdfPages(): PdfPageSummary[] {
  const sections = Array.from(document.querySelectorAll<HTMLElement>(".pdf-page"));
  return sections.map((section, i) => {
    const line = section.querySelector<HTMLElement>(".pdf-line:not(.pdf-empty)");
    const page = Number(section.dataset.page ?? "") || i + 1;
    return { page, firstLine: line?.textContent ?? "" };
  });
}

async function epubChapterPaths(): Promise<string[]> {
  if (!lastBuffer) return [];
  try {
    const files = unzipEpub(lastBuffer);
    const opfPath = findOpfPath(files);
    const baseDir = dirName(opfPath);
    const key = findFileKey(files, opfPath);
    if (key === undefined) return [];
    const pkg = parseOpf(decodeText(files[key]!), null);
    const paths: string[] = [];
    for (const idref of pkg.spine) {
      const item = pkg.manifest[idref];
      if (!item) continue;
      paths.push(resolveHref(baseDir, item.href));
    }
    return paths;
  } catch {
    return [];
  }
}

function renderToc(): void {
  const list = $("tocList");
  if (!list) return;
  list.textContent = "";
  if (tocItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "toc-empty";
    empty.textContent = "No contents for this document.";
    list.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const item of tocItems) {
    const li = document.createElement("li");
    li.className = "toc-entry";
    li.dataset.depth = String(item.depth);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toc-link";
    if (item.marker.length > 0) {
      const marker = document.createElement("span");
      marker.className = "toc-marker";
      marker.textContent = item.marker;
      button.appendChild(marker);
    }
    const label = document.createElement("span");
    label.className = "toc-label";
    label.textContent = item.label;
    button.appendChild(label);
    button.addEventListener("click", () => selectTocItem(item.target));
    li.appendChild(button);
    fragment.appendChild(li);
  }
  list.appendChild(fragment);
}

function selectTocItem(target: number): void {
  if (!kind) return;
  hasNavigated = true;
  goToTarget(target);
  persistCurrentPosition();
  closeToc();
  $("tocToggle")?.focus();
}

// ── navigation ─────────────────────────────────────────────────────────────

function goToPdfPage(index: number): void {
  const pages = Array.from(document.querySelectorAll<HTMLElement>(".pdf-page"));
  const page = pages[index];
  if (!page) return;
  currentPdfPage = index;
  page.scrollIntoView({ behavior: "smooth", block: "start" });
}

function goToTarget(index: number): void {
  if (kind === "epub" && epub) {
    epub.goToIndex(index);
    updatePosition();
    return;
  }
  if (kind === "pdf") goToPdfPage(index);
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
    const index = target ? pages.indexOf(target) : -1;
    if (index >= 0) currentPdfPage = index;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function focused(): FocusLike {
  const el = document.activeElement as HTMLElement | null;
  const panel = $("tocPanel");
  return {
    tagName: el?.tagName ?? "",
    isContentEditable: Boolean(el?.isContentEditable),
    inContentsPanel: Boolean(panel && el && panel.contains(el)),
  };
}

function wireKeyboard(): void {
  window.addEventListener("keydown", (event) => {
    const intent = navIntent(
      {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        isComposing: event.isComposing,
        defaultPrevented: event.defaultPrevented,
      },
      focused(),
      tocOpen,
    );
    if (intent === null) return;
    if (intent === "toggle-toc") {
      event.preventDefault();
      toggleToc();
      return;
    }
    if (intent === "close-toc") {
      event.preventDefault();
      closeToc();
      $("tocToggle")?.focus();
      return;
    }
    if (!kind) return;
    event.preventDefault();
    if (intent === "next" || intent === "prev") {
      hasNavigated = true;
      step(intent === "next" ? 1 : -1);
    } else if (intent === "first") {
      hasNavigated = true;
      goToTarget(0);
    } else if (intent === "last") {
      hasNavigated = true;
      goToTarget(lastIndex());
    }
    persistCurrentPosition();
  });
}

function wireScrollTracking(): void {
  let timer: number | null = null;
  window.addEventListener(
    "scroll",
    () => {
      if (kind !== "pdf" || timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        if (kind !== "pdf") return;
        const pages = Array.from(document.querySelectorAll<HTMLElement>(".pdf-page"));
        if (pages.length === 0) return;
        const top = window.scrollY;
        let index = 0;
        for (let i = 0; i < pages.length; i += 1) {
          if (pages[i]!.offsetTop <= top + 40) index = i;
          else break;
        }
        if (index !== currentPdfPage) {
          currentPdfPage = index;
          persistCurrentPosition();
        } else if (hasNavigated) {
          persistCurrentPosition();
        }
      }, 400);
    },
    { passive: true },
  );
}

// ── document loading ───────────────────────────────────────────────────────

async function openBuffer(buffer: ArrayBuffer, name: string): Promise<void> {
  const doc = $("doc");
  if (!doc) return;
  const detected = sniff(buffer);
  if (!detected) {
    setStatus(`${name || "That file"} is not a PDF or EPUB.`);
    return;
  }

  destroyCurrent();
  resetToc();
  hideResume();
  activeKey = null;
  hasNavigated = false;
  currentPdfPage = 0;
  lastBuffer = buffer;
  const identity = positionKey(detected, new Uint8Array(buffer));

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

    activeKey = identity;
    const stored = recallPosition(positionStore, identity);
    if (stored && stored.kind === detected && stored.index > 0 && stored.index <= lastIndex()) {
      showResume(stored);
    }
  } catch (error) {
    destroyCurrent();
    lastBuffer = null;
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

function wire(): void {
  populateModes();
  syncControls();

  $("openFile")?.addEventListener("click", () => $input("file")?.click());
  $("pickFile")?.addEventListener("click", () => $input("file")?.click());
  $input("file")?.addEventListener("change", () => {
    const file = $input("file")?.files?.[0];
    if (file) void openFile(file);
  });

  $("prev")?.addEventListener("click", () => {
    hasNavigated = true;
    step(-1);
    persistCurrentPosition();
  });
  $("next")?.addEventListener("click", () => {
    hasNavigated = true;
    step(1);
    persistCurrentPosition();
  });

  $("tocToggle")?.addEventListener("click", () => toggleToc());

  wireResume();
  wireKeyboard();
  wireScrollTracking();
  window.addEventListener("pagehide", () => persistCurrentPosition());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistCurrentPosition();
  });

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
  await readPositionStore();

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
    tocCount: () => tocItems.length,
    tocOpen: () => tocOpen,
    resumeVisible: () => $("resume")?.hidden === false,
  };
} catch {
  /* ignore */
}

void init();
