import * as pdfjsLib from "pdfjs-dist";
import type { PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { BionicOptions } from "../core/algorithm";
import { emphasize } from "../core/algorithm";
import { fitScale, itemBox, itemGeometry, matchSamples, type ItemGeometry, type StyleLike } from "./layout";
import { groupLines, type PdfTextItem } from "./lines";

export { groupLines } from "./lines";
export type { PdfTextItem } from "./lines";

export interface PdfHandle {
  readonly pageCount: number;
  /** First reconstructed line of every page, for the contents list. */
  firstLines(): Promise<string[]>;
  setOptions(options: BionicOptions): void;
  destroy(): void;
}

const HEAD_CLASS = "bp-head";
const SKIP_TAGS = new Set(["script", "style", "noscript", "textarea", "code", "pre", "kbd", "samp"]);
const TOKEN_RE = /\S+/g;

/** Configure the PDF.js worker. Extension pages pass a runtime URL; tests pass a relative one. */
export function setPdfWorkerSrc(src: string): void {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = src;
  } catch {
    /* ignore */
  }
}

let assetBase = "";

/** Base URL for the bundled cmaps/ and standard_fonts/ folders (an extension URL, or "" in tests). */
export function setPdfAssetBase(base: string): void {
  assetBase = typeof base === "string" ? base : "";
}

interface TextRecord {
  parent: Node;
  original: Text;
  inserted: Node[];
}

function applyFixation(
  root: ParentNode,
  options: BionicOptions,
  records: TextRecord[],
  processed: WeakSet<Text>,
): void {
  const doc = (root as Node).ownerDocument;
  if (!doc) return;
  const walker = doc.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const next = walker.nextNode() as Text | null;
    try {
      const parent = node.parentElement;
      if (
        parent &&
        !processed.has(node) &&
        parent.closest("." + HEAD_CLASS) === null &&
        !SKIP_TAGS.has(parent.tagName.toLowerCase())
      ) {
        const source = node.data;
        const fragment = doc.createDocumentFragment();
        let changed = false;
        let lastIndex = 0;
        TOKEN_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = TOKEN_RE.exec(source)) !== null) {
          const token = match[0];
          const start = match.index;
          if (start > lastIndex) fragment.appendChild(doc.createTextNode(source.slice(lastIndex, start)));
          const split = token ? emphasize(token, options) : null;
          if (split && split.head) {
            const b = doc.createElement("b");
            b.className = HEAD_CLASS;
            b.textContent = split.head;
            fragment.appendChild(b);
            if (split.tail) fragment.appendChild(doc.createTextNode(split.tail));
            changed = true;
          } else {
            fragment.appendChild(doc.createTextNode(token));
          }
          lastIndex = start + token.length;
        }
        if (lastIndex < source.length) fragment.appendChild(doc.createTextNode(source.slice(lastIndex)));
        if (changed) {
          const inserted = Array.from(fragment.childNodes);
          node.replaceWith(fragment);
          for (const n of inserted) if (n.nodeType === 3) processed.add(n as Text);
          records.push({ parent, original: node, inserted });
        }
      }
    } catch {
      /* skip this node */
    }
    node = next;
  }
}

function revertRecords(records: TextRecord[], processed: WeakSet<Text>): void {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (!record) continue;
    try {
      const parent = record.parent;
      let ref: Node | null = null;
      for (const n of record.inserted) {
        if (n.parentNode === parent) {
          ref = n;
          break;
        }
      }
      if (ref && ref.parentNode === parent) parent.insertBefore(record.original, ref);
      else parent.appendChild(record.original);
      for (const n of record.inserted) {
        if (n.parentNode) n.parentNode.removeChild(n);
        if (n.nodeType === 3) processed.delete(n as Text);
      }
    } catch {
      /* keep going */
    }
  }
  records.length = 0;
}


// ── page model ─────────────────────────────────────────────────────────────

const MAX_CANVAS_PIXELS = 16_777_216;
const NEAR_MARGIN = "150% 0px";
const FAR_MARGIN = "400% 0px";
const BOLD_RE = /bold|black|heavy|semibold|demi/i;
const ITALIC_RE = /italic|oblique/i;

interface RawItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
  dir: string;
}

interface RawStyle extends StyleLike {
  fontFamily?: string;
}

interface RawContent {
  items: RawItem[];
  styles: Record<string, RawStyle>;
}

/** One glyph the canvas was asked to draw; we hold it back and decide later. */
interface Sample {
  kind: "fill" | "stroke";
  text: string;
  x: number;
  y: number;
  transform: DOMMatrix;
  font: string;
  style: unknown;
  alpha: number;
  lineWidth: number;
  composite: string;
  /** Glyph origin in canvas pixels. */
  px: number;
  py: number;
}

interface Run {
  item: RawItem;
  style: RawStyle | undefined;
  /** Geometry at scale 1, used to place the DOM text. */
  geom1: ItemGeometry;
  /** Geometry in canvas pixels, used to match glyph samples. */
  geom: ItemGeometry;
}

interface FontHints {
  weight: number;
  italic: boolean;
}

interface PageState {
  index: number;
  page: PDFPageProxy | null;
  section: HTMLElement;
  sheet: HTMLElement;
  width: number;
  height: number;
  transform: number[];
  canvas: HTMLCanvasElement | null;
  layer: HTMLElement | null;
  records: TextRecord[];
  content: Promise<RawContent> | null;
  lines: string[] | null;
  built: boolean;
  queued: boolean;
  wanted: boolean;
  inFar: boolean;
}

function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

function normalizeContent(raw: { items: unknown[]; styles: unknown }): RawContent {
  const items: RawItem[] = [];
  for (const entry of raw.items as Array<Record<string, unknown>>) {
    if (!entry || typeof entry.str !== "string" || entry.str.length === 0) continue;
    const transform = Array.isArray(entry.transform) ? (entry.transform as number[]) : [];
    if (transform.length < 6 || !transform.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    items.push({
      str: entry.str,
      transform,
      width: typeof entry.width === "number" ? entry.width : 0,
      height: typeof entry.height === "number" ? entry.height : 0,
      fontName: typeof entry.fontName === "string" ? entry.fontName : "",
      hasEOL: Boolean(entry.hasEOL),
      dir: typeof entry.dir === "string" ? entry.dir : "ltr",
    });
  }
  const styles = (raw.styles && typeof raw.styles === "object" ? raw.styles : {}) as Record<string, RawStyle>;
  return { items, styles };
}

function toLineItems(content: RawContent): PdfTextItem[] {
  return content.items.map((item) => ({
    str: item.str,
    x: item.transform[4] ?? 0,
    y: item.transform[5] ?? 0,
    height: item.height > 0 ? item.height : 10,
    hasEOL: item.hasEOL,
  }));
}

// ── glyph capture ──────────────────────────────────────────────────────────

/**
 * Hold back every glyph PDF.js draws on this one context instance. Scratch
 * canvases PDF.js makes for groups and masks are different instances, so text
 * inside them is still painted by PDF.js itself.
 */
function captureGlyphs(ctx: CanvasRenderingContext2D): { samples: Sample[]; release(): void } {
  const samples: Sample[] = [];
  const record = (kind: "fill" | "stroke", text: string, x: number, y: number): void => {
    if (typeof text !== "string" || isBlank(text)) return;
    const t = ctx.getTransform();
    samples.push({
      kind,
      text,
      x,
      y,
      transform: t,
      font: ctx.font,
      style: kind === "fill" ? ctx.fillStyle : ctx.strokeStyle,
      alpha: ctx.globalAlpha,
      lineWidth: ctx.lineWidth,
      composite: ctx.globalCompositeOperation,
      px: t.a * x + t.c * y + t.e,
      py: t.b * x + t.d * y + t.f,
    });
  };
  ctx.fillText = (text: string, x: number, y: number): void => record("fill", text, x, y);
  ctx.strokeText = (text: string, x: number, y: number): void => record("stroke", text, x, y);
  return {
    samples,
    release(): void {
      const own = ctx as unknown as Record<string, unknown>;
      delete own.fillText;
      delete own.strokeText;
    },
  };
}

/** Paint held-back glyphs onto the canvas exactly as PDF.js would have. */
function replaySamples(ctx: CanvasRenderingContext2D, samples: ReadonlyArray<Sample>, which: ReadonlyArray<number>): void {
  const fill = CanvasRenderingContext2D.prototype.fillText;
  const stroke = CanvasRenderingContext2D.prototype.strokeText;
  for (const index of which) {
    const sample = samples[index];
    if (!sample) continue;
    ctx.save();
    try {
      ctx.setTransform(sample.transform);
      ctx.font = sample.font;
      ctx.globalAlpha = sample.alpha;
      ctx.lineWidth = sample.lineWidth;
      ctx.globalCompositeOperation = sample.composite as GlobalCompositeOperation;
      if (sample.kind === "fill") {
        ctx.fillStyle = sample.style as string;
        fill.call(ctx, sample.text, sample.x, sample.y);
      } else {
        ctx.strokeStyle = sample.style as string;
        stroke.call(ctx, sample.text, sample.x, sample.y);
      }
    } catch {
      /* a glyph that cannot be replayed is skipped */
    } finally {
      ctx.restore();
    }
  }
}

// ── text layer ─────────────────────────────────────────────────────────────

const baselineCache = new Map<string, number | undefined>();

/**
 * Where the baseline sits inside a one-em line box for this family in this
 * browser, as a fraction of the font size. The page geometry gives the baseline
 * position, so the box has to be moved up by exactly this much.
 */
function baselineRatio(family: string): number | undefined {
  if (baselineCache.has(family)) return baselineCache.get(family);
  let ratio: number | undefined;
  try {
    const ctx = measurer();
    if (ctx) {
      ctx.font = `100px ${family}`;
      const m = ctx.measureText("Hg");
      if (typeof m.fontBoundingBoxAscent === "number" && typeof m.fontBoundingBoxDescent === "number") {
        const content = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
        if (content > 0) ratio = ((100 - content) / 2 + m.fontBoundingBoxAscent) / 100;
      }
    }
  } catch {
    ratio = undefined;
  }
  baselineCache.set(family, ratio);
  return ratio;
}

function makeRuns(content: RawContent, vp1Transform: number[], vpTransform: number[]): Run[] {
  return content.items.map((item) => {
    const style = content.styles[item.fontName];
    const ratio = baselineRatio(style?.fontFamily || "sans-serif");
    return {
      item,
      style,
      geom1: itemGeometry(item, ratio === undefined ? style : { ...style, ascent: ratio }, vp1Transform),
      geom: itemGeometry(item, style, vpTransform),
    };
  });
}

function fontHints(page: PDFPageProxy, fontName: string, cache: Map<string, FontHints>): FontHints {
  const cached = cache.get(fontName);
  if (cached) return cached;
  const hints: FontHints = { weight: 400, italic: false };
  try {
    if (fontName && page.commonObjs.has(fontName)) {
      const font = page.commonObjs.get(fontName) as Record<string, unknown> | null;
      const name = font && typeof font.name === "string" ? font.name : "";
      if (font && (font.bold || font.black || BOLD_RE.test(name))) hints.weight = 700;
      if (font && (font.italic || ITALIC_RE.test(name))) hints.italic = true;
    }
  } catch {
    /* the fallback family is still readable */
  }
  cache.set(fontName, hints);
  return hints;
}

function createSpan(run: Run, size: { width: number; height: number }, hints: FontHints, paint: Sample | null | "plain"): HTMLElement {
  const { item, style, geom1 } = run;
  const span = document.createElement("span");
  span.textContent = item.str;
  if (item.dir === "rtl") span.dir = "rtl";
  const css = span.style;
  css.left = `${((100 * geom1.left) / size.width).toFixed(3)}%`;
  css.top = `${((100 * geom1.top) / size.height).toFixed(3)}%`;
  css.fontSize = `${((100 * geom1.fontHeight) / size.width).toFixed(4)}cqw`;
  css.fontFamily = style?.fontFamily || "sans-serif";
  if (hints.weight >= 700) css.fontWeight = String(hints.weight);
  if (hints.italic) css.fontStyle = "italic";
  span.dataset.w = String(geom1.targetWidth);
  span.dataset.fs = String(geom1.fontHeight);
  span.dataset.a = String(geom1.angle);
  span.dataset.wt = String(hints.weight);
  if (paint === "plain") {
    css.color = "#000";
  } else if (paint) {
    css.color = typeof paint.style === "string" ? paint.style : "#000";
    if (paint.alpha < 1) css.opacity = String(Math.max(0, paint.alpha));
  } else {
    span.className = "pdf-ghost";
  }
  return span;
}

/** Build the positioned, selectable text for one page; the caller applies fixation. */
function buildTextLayer(
  page: PDFPageProxy,
  runs: ReadonlyArray<Run>,
  paints: ReadonlyArray<Sample | null | "plain">,
  size: { width: number; height: number },
): HTMLElement {
  const layer = document.createElement("div");
  layer.className = "pdf-text-layer";
  const cache = new Map<string, FontHints>();
  runs.forEach((run, i) => {
    try {
      if (!isBlank(run.item.str)) {
        const hints = fontHints(page, run.item.fontName, cache);
        layer.appendChild(createSpan(run, size, hints, paints[i] ?? null));
      }
      if (run.item.hasEOL) layer.appendChild(document.createElement("br"));
    } catch {
      /* skip this run */
    }
  });
  return layer;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

function measurer(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement("canvas").getContext("2d");
    } catch {
      measureCtx = null;
    }
  }
  return measureCtx;
}

/**
 * Stretch or squeeze each run so it is as wide as the original text, whatever
 * font the browser substituted and however many bold heads were inserted. Uses
 * canvas text measurement only, so it forces no layout.
 */
function fitLayer(layer: HTMLElement): void {
  const ctx = measurer();
  if (!ctx) return;
  let lastFont = "";
  const measure = (text: string, font: string): number => {
    if (font !== lastFont) {
      ctx.font = font;
      lastFont = font;
    }
    return ctx.measureText(text).width;
  };
  for (const span of Array.from(layer.querySelectorAll<HTMLElement>("span"))) {
    try {
      const target = Number(span.dataset.w);
      const fontSize = Number(span.dataset.fs);
      const angle = Number(span.dataset.a) || 0;
      const weight = Number(span.dataset.wt) || 400;
      const family = span.style.fontFamily || "sans-serif";
      const slant = span.style.fontStyle === "italic" ? "italic " : "";
      const body = `${slant}${weight} 100px ${family}`;
      const head = `${slant}${weight >= 700 ? 900 : 700} 100px ${family}`;
      let natural = 0;
      span.childNodes.forEach((child) => {
        const font = child.nodeType === 1 ? head : body;
        natural += (measure(child.textContent ?? "", font) * fontSize) / 100;
      });
      const k = fitScale(target, natural);
      const parts: string[] = [];
      if (angle !== 0) parts.push(`rotate(${angle}rad)`);
      if (k !== 1) parts.push(`scaleX(${k.toFixed(4)})`);
      span.style.transform = parts.join(" ");
    } catch {
      /* leave this run unscaled */
    }
  }
}

// ── document ───────────────────────────────────────────────────────────────

function createShell(index: number, width: number, height: number): { section: HTMLElement; sheet: HTMLElement } {
  const section = document.createElement("section");
  section.className = "pdf-page";
  section.dataset.page = String(index + 1);
  const label = document.createElement("p");
  label.className = "pdf-page-label";
  label.textContent = `Page ${index + 1}`;
  const sheet = document.createElement("div");
  sheet.className = "pdf-sheet";
  sheet.style.aspectRatio = `${width} / ${height}`;
  section.append(label, sheet);
  return { section, sheet };
}

/**
 * Open a PDF and show every page as the original page, with fixation applied
 * to its text. PDF.js paints everything except text glyphs onto a canvas; the
 * text is placed over it as real, selectable DOM text at the original spot.
 * Everything is parsed and drawn locally; nothing leaves the device.
 */
export async function openPdf(
  data: ArrayBuffer | Uint8Array,
  container: HTMLElement,
  options: BionicOptions,
): Promise<PdfHandle> {
  const doc = await pdfjsLib.getDocument({
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: `${assetBase}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
  }).promise;

  let current = options;
  let destroyed = false;
  let renderTask: RenderTask | null = null;
  const processed = new WeakSet<Text>();
  const states: PageState[] = [];
  const byElement = new WeakMap<Element, PageState>();

  container.textContent = "";
  container.classList.add("pdf-doc");

  for (let n = 1; n <= doc.numPages; n += 1) {
    let page: PDFPageProxy | null = null;
    let width = 612;
    let height = 792;
    let transform = [1, 0, 0, -1, 0, 792];
    try {
      page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      width = vp.width;
      height = vp.height;
      transform = vp.transform as number[];
    } catch {
      page = null;
    }
    const { section, sheet } = createShell(n - 1, width, height);
    const state: PageState = {
      index: n - 1,
      page,
      section,
      sheet,
      width,
      height,
      transform,
      canvas: null,
      layer: null,
      records: [],
      content: null,
      lines: null,
      built: false,
      queued: false,
      wanted: false,
      inFar: false,
    };
    states.push(state);
    byElement.set(sheet, state);
    container.appendChild(section);
  }

  const contentFor = (state: PageState): Promise<RawContent> => {
    if (!state.content) {
      const page = state.page;
      state.content = page
        ? page.getTextContent().then((raw) => normalizeContent(raw as unknown as { items: unknown[]; styles: unknown }))
        : Promise.resolve({ items: [], styles: {} });
      state.content.catch(() => {
        state.content = null;
      });
    }
    return state.content;
  };

  const renderCanvas = async (state: PageState): Promise<{ canvas: HTMLCanvasElement | null; ctx: CanvasRenderingContext2D | null; samples: Sample[]; transform: number[] }> => {
    const page = state.page!;
    const cssWidth = state.sheet.clientWidth || 800;
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min((cssWidth * dpr) / state.width, Math.sqrt(MAX_CANVAS_PIXELS / (state.width * state.height)));
    const vp = page.getViewport({ scale: Math.max(0.1, scale) });
    const canvas = document.createElement("canvas");
    canvas.className = "pdf-canvas";
    canvas.width = Math.max(1, Math.floor(vp.width));
    canvas.height = Math.max(1, Math.floor(vp.height));
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) return { canvas: null, ctx: null, samples: [], transform: vp.transform as number[] };
    const capture = captureGlyphs(ctx);
    try {
      renderTask = page.render({ canvasContext: ctx, viewport: vp });
      await renderTask.promise;
    } catch {
      /* cancelled, or a draw error: keep whatever was painted and carry on */
    } finally {
      renderTask = null;
      capture.release();
    }
    return { canvas, ctx, samples: capture.samples, transform: vp.transform as number[] };
  };

  const buildPage = async (state: PageState): Promise<void> => {
    const page = state.page;
    if (!page || state.built || destroyed || !state.wanted) return;
    const drawn = await renderCanvas(state);
    if (destroyed) return;
    let content: RawContent = { items: [], styles: {} };
    try {
      content = await contentFor(state);
    } catch {
      /* the page is drawn without a text layer */
    }
    if (destroyed) return;

    const runs = makeRuns(content, state.transform, drawn.transform);
    const boxes = runs.map((run) => itemBox(run.geom, 0.25 * run.geom.fontHeight));
    const match = matchSamples(boxes, drawn.samples.map((s) => ({ x: s.px, y: s.py })));
    if (drawn.ctx) replaySamples(drawn.ctx, drawn.samples, match.unmatched);

    const paints = runs.map((_, i): Sample | null | "plain" => {
      if (!drawn.ctx) return "plain";
      const at = match.itemSample[i] ?? -1;
      return at >= 0 ? (drawn.samples[at] ?? null) : null;
    });
    const layer = buildTextLayer(page, runs, paints, { width: state.width, height: state.height });
    applyFixation(layer, current, state.records, processed);
    fitLayer(layer);
    if (drawn.canvas) state.sheet.appendChild(drawn.canvas);
    state.sheet.appendChild(layer);
    state.canvas = drawn.canvas;
    state.layer = layer;
    state.built = true;
    if (!state.inFar && observers) evictPage(state);
  };

  const evictPage = (state: PageState): void => {
    if (!state.built) return;
    try {
      revertRecords(state.records, processed);
      state.layer?.remove();
      if (state.canvas) {
        state.canvas.remove();
        state.canvas.width = 0;
        state.canvas.height = 0;
      }
      state.page?.cleanup();
    } catch {
      /* ignore */
    }
    state.canvas = null;
    state.layer = null;
    state.built = false;
  };

  let chain: Promise<void> = Promise.resolve();
  const enqueue = (state: PageState): void => {
    if (state.queued || state.built || destroyed) return;
    state.queued = true;
    chain = chain
      .then(async () => {
        state.queued = false;
        await buildPage(state);
      })
      .catch(() => {
        state.queued = false;
      });
  };

  let observers: { near: IntersectionObserver; far: IntersectionObserver } | null = null;
  try {
    if (typeof IntersectionObserver !== "undefined") {
      const near = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const state = byElement.get(entry.target);
            if (!state) continue;
            state.wanted = entry.isIntersecting;
            if (entry.isIntersecting) enqueue(state);
          }
        },
        { rootMargin: NEAR_MARGIN },
      );
      const far = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const state = byElement.get(entry.target);
            if (!state) continue;
            state.inFar = entry.isIntersecting;
            if (!entry.isIntersecting) evictPage(state);
          }
        },
        { rootMargin: FAR_MARGIN },
      );
      for (const state of states) {
        near.observe(state.sheet);
        far.observe(state.sheet);
      }
      observers = { near, far };
    }
  } catch {
    observers = null;
  }
  if (!observers) {
    for (const state of states) {
      state.wanted = true;
      state.inFar = true;
      enqueue(state);
    }
  }

  const rebuildBuilt = (): void => {
    for (const state of states) {
      if (!state.built) continue;
      evictPage(state);
      state.wanted = true;
      enqueue(state);
    }
  };

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const onResize = (): void => {
    resizeTimer = null;
    if (destroyed) return;
    const dpr = window.devicePixelRatio || 1;
    const stale = states.some((s) => s.built && s.canvas && s.sheet.clientWidth * dpr > s.canvas.width * 1.15);
    if (stale) rebuildBuilt();
  };
  try {
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        if (resizeTimer !== null) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(onResize, 300);
      });
      resizeObserver.observe(container);
    }
  } catch {
    resizeObserver = null;
  }

  const handle: PdfHandle = {
    get pageCount(): number {
      return states.length;
    },
    async firstLines(): Promise<string[]> {
      const out: string[] = [];
      for (const state of states) {
        if (!state.lines) {
          try {
            state.lines = groupLines(toLineItems(await contentFor(state)));
          } catch {
            state.lines = [];
          }
        }
        out.push(state.lines[0] ?? "");
      }
      return out;
    },
    setOptions(options2: BionicOptions): void {
      current = options2;
      for (const state of states) {
        if (!state.built || !state.layer) continue;
        revertRecords(state.records, processed);
        applyFixation(state.layer, current, state.records, processed);
        fitLayer(state.layer);
      }
    },
    destroy(): void {
      destroyed = true;
      try {
        if (resizeTimer !== null) clearTimeout(resizeTimer);
        resizeObserver?.disconnect();
        observers?.near.disconnect();
        observers?.far.disconnect();
        try {
          void renderTask?.cancel();
        } catch {
          /* ignore */
        }
        for (const state of states) revertRecords(state.records, processed);
        container.textContent = "";
        container.classList.remove("pdf-doc");
        void doc.destroy();
      } catch {
        /* ignore */
      }
    },
  };

  return handle;
}
