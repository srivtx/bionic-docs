/**
 * EPUB container parsing.
 *
 * Everything here is dependency-light: `fflate` for unzipping and a DOMParser
 * for XML/HTML. The DOM parser is resolved from a supplied document's window
 * first (so tests and callers can inject their own) and falls back to the
 * global scope, where browsers expose `DOMParser`.
 *
 * Pure helpers never throw for malformed input: they return empty results and
 * let `openEpub` decide how to degrade.
 */

import { unzipSync } from "fflate";

export interface TocEntry {
  id: string;
  label: string;
  depth: number;
}

export interface OpfManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

export interface OpfPackage {
  title: string;
  manifest: Record<string, OpfManifestItem>;
  spine: string[];
  spineTocId: string | null;
  navItemId: string | null;
}

type ParserCtor = new () => { parseFromString(source: string, type: string): Document };

/** The global DOMParser constructor, if this environment has one. */
function globalParser(): ParserCtor | null {
  const ctor = (globalThis as unknown as { DOMParser?: ParserCtor }).DOMParser;
  return typeof ctor === "function" ? ctor : null;
}

/** Prefer the parser owned by `doc`'s window, then the global one. */
function resolveParser(doc?: Document | null): ParserCtor | null {
  const view = doc?.defaultView as unknown as { DOMParser?: ParserCtor } | null | undefined;
  const fromDoc = view?.DOMParser;
  if (typeof fromDoc === "function") return fromDoc;
  return globalParser();
}

/** Parse `source` with the best available parser, or return null. */
function parseDocument(
  source: string,
  mime: "text/xml" | "text/html",
  doc?: Document | null,
): Document | null {
  const ctor = resolveParser(doc);
  if (ctor === null) return null;
  try {
    return new ctor().parseFromString(source, mime);
  } catch {
    return null;
  }
}

/** Unzip an EPUB into a path -> bytes map. */
export function unzipEpub(data: ArrayBuffer): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(data));
}

/** Decode bytes as UTF-8, with a byte-wise fallback for exotic globals. */
export function decodeText(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      /* fall through to the manual decoder */
    }
  }
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

/** Collapse `.`/`..` segments and strip leading/duplicate slashes. */
export function normalizePath(path: string): string {
  const parts = path.replace(/\\/g, "/").trim().split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

/** Directory portion of a package path ("" at the root). */
export function dirName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx < 0 ? "" : path.slice(0, idx);
}

/** Resolve a manifest href (fragment/query stripped) against a base directory. */
export function resolveHref(baseDir: string, href: string): string {
  const withoutFragment = href.split("#")[0] ?? "";
  const withoutQuery = withoutFragment.split("?")[0] ?? "";
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    /* keep the raw value */
  }
  if (decoded.startsWith("/")) return normalizePath(decoded);
  return normalizePath(baseDir.length > 0 ? `${baseDir}/${decoded}` : decoded);
}

/** The fragment carried by an href (`""` when there is none). */
export function hrefFragment(href: string): string {
  const idx = href.indexOf("#");
  return idx < 0 ? "" : href.slice(idx + 1);
}

/** Locate a zip entry by exact path, then case-insensitively. */
export function findFileKey(
  files: Record<string, Uint8Array>,
  path: string,
): string | undefined {
  if (Object.prototype.hasOwnProperty.call(files, path)) return path;
  const lower = path.toLowerCase();
  for (const key of Object.keys(files)) {
    if (key.toLowerCase() === lower) return key;
  }
  return undefined;
}

function localNameOf(el: Element): string {
  const raw = (el.localName ?? el.tagName ?? "").toLowerCase();
  const idx = raw.indexOf(":");
  return idx >= 0 ? raw.slice(idx + 1) : raw;
}

function childNodesOf(node: Node): NodeListOf<ChildNode> | null {
  return node.nodeType === 1 || node.nodeType === 9 || node.nodeType === 11
    ? node.childNodes
    : null;
}

/** Every element under `root`, in document order. */
export function collectElements(root: Node): Element[] {
  const out: Element[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === 1) out.push(node as Element);
    const children = childNodesOf(node);
    if (!children) return;
    for (let i = 0; i < children.length; i++) visit(children[i]!);
  };
  visit(root);
  return out;
}

/** Elements whose (prefix-stripped, lowercased) local name matches `name`. */
export function collectByLocalName(root: Node, name: string): Element[] {
  const target = name.toLowerCase();
  return collectElements(root).filter((el) => localNameOf(el) === target);
}

/** Direct element children of `el`. */
export function childElements(el: Element | null | undefined): Element[] {
  if (!el) return [];
  const out: Element[] = [];
  const children = el.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child.nodeType === 1) out.push(child as Element);
  }
  return out;
}

/** First direct element child of `el` with the given local name. */
export function firstChildByLocalName(
  el: Element | null | undefined,
  name: string,
): Element | null {
  const target = name.toLowerCase();
  for (const child of childElements(el)) {
    if (localNameOf(child) === target) return child;
  }
  return null;
}

/**
 * Read `META-INF/container.xml` and return the OPF rootfile path.
 * Throws only when the container is missing or malformed; callers that must
 * never throw (openEpub) wrap it.
 */
export function findOpfPath(files: Record<string, Uint8Array>): string {
  const key = findFileKey(files, "META-INF/container.xml");
  if (key === undefined) throw new Error("EPUB: META-INF/container.xml not found");
  const xml = decodeText(files[key]!);

  const parsed = parseDocument(xml, "text/xml");
  if (parsed) {
    for (const rootfile of collectByLocalName(parsed, "rootfile")) {
      const full = rootfile.getAttribute("full-path") ?? rootfile.getAttribute("fullpath");
      if (full !== null && full.trim().length > 0) return normalizePath(full);
    }
  }

  const match = /full-path\s*=\s*["']([^"']+)["']/i.exec(xml);
  if (match && match[1] !== undefined) return normalizePath(match[1]);
  throw new Error("EPUB: no rootfile declared in container.xml");
}

/** Parse the OPF package document: title, manifest, spine, toc references. */
export function parseOpf(xml: string, doc?: Document | null): OpfPackage {
  const pkg: OpfPackage = {
    title: "",
    manifest: {},
    spine: [],
    spineTocId: null,
    navItemId: null,
  };

  const parsed = parseDocument(xml, "text/xml", doc);
  if (!parsed) return pkg;

  const metadata = collectByLocalName(parsed, "metadata")[0] ?? parsed;
  for (const title of collectByLocalName(metadata, "title")) {
    const text = (title.textContent ?? "").trim();
    if (text.length > 0) {
      pkg.title = text;
      break;
    }
  }

  for (const item of collectByLocalName(parsed, "item")) {
    const id = item.getAttribute("id") ?? "";
    const href = item.getAttribute("href") ?? "";
    if (id.length === 0 || href.length === 0) continue;
    const properties = item.getAttribute("properties") ?? "";
    pkg.manifest[id] = {
      id,
      href,
      mediaType: item.getAttribute("media-type") ?? "",
      properties,
    };
    if (properties.split(/\s+/).includes("nav")) pkg.navItemId = id;
  }

  const spine = collectByLocalName(parsed, "spine")[0];
  if (spine) {
    pkg.spineTocId = spine.getAttribute("toc");
    for (const itemref of childElements(spine)) {
      if (localNameOf(itemref) !== "itemref") continue;
      const idref = itemref.getAttribute("idref") ?? "";
      if (idref.length > 0) pkg.spine.push(idref);
    }
  }

  return pkg;
}

function tocId(href: string, baseDir: string): string {
  const fragment = hrefFragment(href);
  if (fragment.length > 0) return fragment;
  return href.length > 0 ? resolveHref(baseDir, href) : "";
}

/** Parse an EPUB3 nav document into a flat, depth-annotated TOC. */
export function parseTocNav(
  xml: string,
  baseDir: string,
  doc?: Document | null,
): TocEntry[] {
  const parsed =
    parseDocument(xml, "text/xml", doc) ?? parseDocument(xml, "text/html", doc);
  if (!parsed) return [];

  const navs = collectByLocalName(parsed, "nav");
  let chosen: Element | null = null;
  for (const nav of navs) {
    const type = (nav.getAttribute("epub:type") ?? nav.getAttribute("type") ?? "").toLowerCase();
    if (type.split(/\s+/).includes("toc")) {
      chosen = nav;
      break;
    }
  }
  if (!chosen) chosen = navs[0] ?? null;
  if (!chosen) return [];

  const entries: TocEntry[] = [];
  const walkList = (list: Element | null, depth: number): void => {
    if (!list) return;
    for (const li of childElements(list)) {
      if (localNameOf(li) !== "li") continue;
      const anchor = firstChildByLocalName(li, "a");
      if (anchor) {
        const href = anchor.getAttribute("href") ?? "";
        const label = (anchor.textContent ?? "").trim();
        entries.push({ id: tocId(href, baseDir), label, depth });
      }
      walkList(firstChildByLocalName(li, "ol"), depth + 1);
    }
  };
  walkList(firstChildByLocalName(chosen, "ol"), 0);
  return entries;
}

/** Parse an EPUB2 NCX document into a flat, depth-annotated TOC. */
export function parseTocNcx(
  xml: string,
  baseDir: string,
  doc?: Document | null,
): TocEntry[] {
  const parsed =
    parseDocument(xml, "text/xml", doc) ?? parseDocument(xml, "text/html", doc);
  if (!parsed) return [];

  const navMap = collectByLocalName(parsed, "navMap")[0] ?? null;
  if (!navMap) return [];
  const entries: TocEntry[] = [];
  const walk = (parent: Element, depth: number): void => {
    for (const navPoint of childElements(parent)) {
      if (localNameOf(navPoint) !== "navpoint") continue;
      const labelEl = firstChildByLocalName(navPoint, "navlabel");
      const textEl = labelEl ? firstChildByLocalName(labelEl, "text") : null;
      const label = (textEl?.textContent ?? "").trim();
      const content = firstChildByLocalName(navPoint, "content");
      const src = content?.getAttribute("src") ?? "";
      const id = navPoint.getAttribute("id") ?? tocId(src, baseDir);
      entries.push({ id, label, depth });
      walk(navPoint, depth + 1);
    }
  };
  walk(navMap, 0);
  return entries;
}

const DANGEROUS_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
]);

function isJavascriptUrl(value: string): boolean {
  const normalized = value.replace(/[\u0000-\u0020]+/g, "").toLowerCase();
  return normalized.startsWith("javascript:");
}

/**
 * Parse a chapter and remove active content: script/style/iframe/object/embed/
 * link/meta/base elements, every `on*` attribute, and javascript: URLs in
 * `href`/`src`. Nothing else is rewritten.
 */
export function sanitizeChapter(html: string, doc: Document): Document {
  const parsed = parseDocument(html, "text/html", doc);
  if (!parsed) return doc;

  for (const el of collectElements(parsed)) {
    if (DANGEROUS_TAGS.has(localNameOf(el))) {
      el.parentNode?.removeChild(el);
    }
  }

  for (const el of collectElements(parsed)) {
    const attrs = el.attributes;
    const names: string[] = [];
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      if (attr) names.push(attr.name);
    }
    for (const name of names) {
      const lower = name.toLowerCase();
      if (lower.startsWith("on")) {
        el.removeAttribute(name);
        continue;
      }
      if (lower === "href" || lower === "src") {
        const value = el.getAttribute(name) ?? "";
        if (isJavascriptUrl(value)) el.removeAttribute(name);
      }
    }
  }

  return parsed;
}
