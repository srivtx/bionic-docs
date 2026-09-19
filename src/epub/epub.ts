/**
 * EPUB reader handle.
 *
 * `openEpub` unzips an EPUB, reads its package + table of contents and renders
 * spine chapters into a caller-provided container with bionic fixation applied.
 * Every DOM operation is guarded: these methods never throw into the page.
 */

import { emphasize } from "../core/algorithm";
import type { BionicOptions } from "../core/algorithm";
import {
  decodeText,
  dirName,
  findFileKey,
  findOpfPath,
  parseOpf,
  parseTocNav,
  parseTocNcx,
  resolveHref,
  sanitizeChapter,
  unzipEpub,
} from "./parse";
import type { OpfPackage, TocEntry } from "./parse";

export interface EpubTocEntry {
  id: string;
  label: string;
  depth: number;
}

export interface EpubHandle {
  title: string;
  toc: EpubTocEntry[];
  chapterCount: number;
  currentIndex(): number;
  goToIndex(index: number): void;
  setOptions(options: BionicOptions): void;
  destroy(): void;
}

/** Text nodes already turned into fixation markup. Kept across renders. */
const processedTextNodes = new WeakSet<Text>();

const SKIP_TAGS = new Set([
  "script",
  "style",
  "code",
  "pre",
  "kbd",
  "samp",
  "textarea",
]);

interface ChapterRef {
  path: string;
}

function localNameOf(el: Element): string {
  const raw = (el.localName ?? el.tagName ?? "").toLowerCase();
  const idx = raw.indexOf(":");
  return idx >= 0 ? raw.slice(idx + 1) : raw;
}

function collectTextNodes(root: Node): Text[] {
  const out: Text[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      out.push(node as Text);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const name = localNameOf(el);
    if (SKIP_TAGS.has(name)) return;
    if (el.getAttribute("data-bionic") === "off") return;
    if (name === "b" && el.classList.contains("bp-head")) return;

    let child = node.firstChild;
    while (child) {
      const next = child.nextSibling;
      visit(child);
      child = next;
    }
  };
  visit(root);
  return out;
}

function applyFixation(
  root: HTMLElement,
  doc: Document,
  options: BionicOptions,
  records: HTMLElement[],
  processed: WeakSet<Text>,
): void {
  for (const textNode of collectTextNodes(root)) {
    if (processed.has(textNode)) continue;
    processed.add(textNode);

    const original = textNode.data;
    if (original.length === 0) continue;

    const fragment = doc.createDocumentFragment();
    let changed = false;

    for (const part of original.split(/(\s+)/)) {
      if (part.length === 0) continue;
      if (/^\s+$/.test(part)) {
        fragment.appendChild(doc.createTextNode(part));
        continue;
      }

      let split: { head: string; tail: string } | null = null;
      try {
        split = emphasize(part, options);
      } catch {
        split = null;
      }

      if (split === null || split.head.length === 0) {
        fragment.appendChild(doc.createTextNode(part));
        continue;
      }

      const head = doc.createElement("b");
      head.className = "bp-head";
      head.textContent = split.head;
      fragment.appendChild(head);
      records.push(head);

      const headText = head.firstChild;
      if (headText && headText.nodeType === 3) processed.add(headText as Text);

      if (split.tail.length > 0) {
        const tail = doc.createTextNode(split.tail);
        fragment.appendChild(tail);
        processed.add(tail);
      }
      changed = true;
    }

    if (changed) {
      const parent = textNode.parentNode;
      if (parent) parent.replaceChild(fragment, textNode);
    }
  }
}

function importInto(doc: Document, node: Node): Node {
  try {
    return doc.importNode(node, true);
  } catch {
    return node.cloneNode(true);
  }
}

function buildToc(
  files: Record<string, Uint8Array>,
  pkg: OpfPackage,
  baseDir: string,
  doc: Document | null,
): TocEntry[] {
  if (pkg.navItemId !== null) {
    const item = pkg.manifest[pkg.navItemId];
    if (item) {
      const key = findFileKey(files, resolveHref(baseDir, item.href));
      if (key !== undefined) {
        const entries = parseTocNav(decodeText(files[key]!), baseDir, doc);
        if (entries.length > 0) return entries;
      }
    }
  }

  let ncxId = pkg.spineTocId;
  if (ncxId === null || ncxId.length === 0) {
    for (const item of Object.values(pkg.manifest)) {
      if (item.mediaType === "application/x-dtbncx+xml") {
        ncxId = item.id;
        break;
      }
    }
  }
  if (ncxId !== null && ncxId.length > 0) {
    const item = pkg.manifest[ncxId];
    if (item) {
      const key = findFileKey(files, resolveHref(baseDir, item.href));
      if (key !== undefined) {
        return parseTocNcx(decodeText(files[key]!), baseDir, doc);
      }
    }
  }

  return [];
}

export async function openEpub(
  data: ArrayBuffer,
  container: HTMLElement,
  options: BionicOptions,
): Promise<EpubHandle> {
  const doc: Document | null =
    container.ownerDocument ??
    (globalThis as unknown as { document?: Document }).document ??
    null;

  let destroyed = false;
  let currentOptions: BionicOptions = { ...options };
  let current = 0;
  let wrapper: HTMLElement | null = null;
  let records: HTMLElement[] = [];
  let files: Record<string, Uint8Array> = {};
  let chapters: ChapterRef[] = [];
  let title = "";
  const toc: EpubTocEntry[] = [];

  const clearWrapper = (): void => {
    for (const head of records) {
      const parent = head.parentNode;
      const owner = head.ownerDocument ?? doc;
      if (parent && owner) {
        parent.replaceChild(owner.createTextNode(head.textContent ?? ""), head);
      }
    }
    records = [];
    if (wrapper) {
      const parent = wrapper.parentNode;
      if (parent) parent.removeChild(wrapper);
      wrapper = null;
    }
  };

  const render = (index: number): void => {
    if (destroyed || doc === null) return;
    clearWrapper();

    const chapter = chapters[index];
    if (!chapter) return;
    const key = findFileKey(files, chapter.path);
    if (key === undefined) return;

    const sanitized = sanitizeChapter(decodeText(files[key]!), doc);
    const body = (sanitized.body as HTMLElement | null) ?? sanitized.documentElement;

    const wrap = doc.createElement("div");
    wrap.className = "epub-chapter";
    wrap.setAttribute("data-bionic-epub", "");

    if (body) {
      for (const child of Array.from(body.childNodes)) {
        wrap.appendChild(importInto(doc, child));
      }
    }

    // Surface the chapter heading so the reader can show and navigate by it.
    const heading = wrap.querySelector("h1, h2, h3");
    if (heading) {
      heading.classList.add("epub-title");
    } else {
      const label = doc.createElement("p");
      label.className = "epub-title";
      label.textContent = toc[index]?.label ?? title ?? "";
      wrap.insertBefore(label, wrap.firstChild);
    }

    wrapper = wrap;
    applyFixation(wrap, doc, currentOptions, records, processedTextNodes);
    container.appendChild(wrap);
  };

  try {
    files = unzipEpub(data);
    const opfPath = findOpfPath(files);
    const baseDir = dirName(opfPath);
    const opfKey = findFileKey(files, opfPath);

    if (opfKey !== undefined) {
      const pkg = parseOpf(decodeText(files[opfKey]!), doc);
      title = pkg.title;

      for (const idref of pkg.spine) {
        const item = pkg.manifest[idref];
        if (!item) continue;
        const path = resolveHref(baseDir, item.href);
        if (findFileKey(files, path) === undefined) continue;
        chapters.push({ path });
      }

      toc.push(...buildToc(files, pkg, baseDir, doc));
    }
  } catch {
    chapters = [];
  }

  const handle: EpubHandle = {
    title,
    toc,
    chapterCount: chapters.length,
    currentIndex(): number {
      return current;
    },
    goToIndex(index: number): void {
      if (destroyed || chapters.length === 0) return;
      let next = Math.trunc(index);
      if (!Number.isFinite(next)) next = 0;
      next = Math.max(0, Math.min(chapters.length - 1, next));
      current = next;
      try {
        render(current);
      } catch {
        /* never throw into the page */
      }
    },
    setOptions(next: BionicOptions): void {
      if (destroyed) return;
      currentOptions = { ...next };
      try {
        render(current);
      } catch {
        /* never throw into the page */
      }
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      try {
        clearWrapper();
      } catch {
        /* ignore */
      }
      try {
        while (container.firstChild) container.removeChild(container.firstChild);
      } catch {
        /* ignore */
      }
    },
  };

  try {
    render(0);
  } catch {
    /* never throw into the page */
  }

  return handle;
}
