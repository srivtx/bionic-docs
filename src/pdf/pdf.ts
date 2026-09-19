import * as pdfjsLib from "pdfjs-dist";
import type { BionicOptions } from "../core/algorithm";
import { emphasize } from "../core/algorithm";
import { groupLines, type PdfTextItem } from "./lines";

export { groupLines } from "./lines";
export type { PdfTextItem } from "./lines";

export interface PdfHandle {
  readonly pageCount: number;
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

/**
 * Open a PDF and render it as reflowed text with fixation emphasis. The text
 * is extracted locally by PDF.js; nothing leaves the device.
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
  }).promise;

  const pageLines: string[][] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    try {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const raw of content.items as Array<Record<string, unknown>>) {
        const str = typeof raw.str === "string" ? raw.str : "";
        if (!str) continue;
        const transform = Array.isArray(raw.transform) ? (raw.transform as number[]) : [];
        items.push({
          str,
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          height: typeof raw.height === "number" ? raw.height : 10,
          hasEOL: Boolean(raw.hasEOL),
        });
      }
      pageLines.push(groupLines(items));
      page.cleanup();
    } catch {
      pageLines.push([]);
    }
  }

  let current = options;
  const records: TextRecord[] = [];
  const processed = new WeakSet<Text>();

  const render = (): void => {
    container.textContent = "";
    records.length = 0;
    for (let i = 0; i < pageLines.length; i += 1) {
      const section = document.createElement("section");
      section.className = "pdf-page";
      section.dataset.page = String(i + 1);
      const label = document.createElement("p");
      label.className = "pdf-page-label";
      label.textContent = `Page ${i + 1}`;
      section.appendChild(label);
      const lines = pageLines[i] ?? [];
      if (lines.length === 0) {
        const empty = document.createElement("p");
        empty.className = "pdf-line pdf-empty";
        empty.textContent = "(no extractable text on this page)";
        section.appendChild(empty);
      }
      for (const line of lines) {
        const p = document.createElement("p");
        p.className = "pdf-line";
        p.textContent = line;
        section.appendChild(p);
      }
      container.appendChild(section);
    }
    applyFixation(container, current, records, processed);
  };

  const handle: PdfHandle = {
    get pageCount(): number {
      return pageLines.length;
    },
    setOptions(options2: BionicOptions): void {
      current = options2;
      revertRecords(records, processed);
      applyFixation(container, current, records, processed);
    },
    destroy(): void {
      try {
        revertRecords(records, processed);
        container.textContent = "";
        void doc.destroy();
      } catch {
        /* ignore */
      }
    },
  };

  render();
  return handle;
}
