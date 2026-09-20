/**
 * Pure keyboard-intent decision for the reader.
 *
 * The reader hands in a plain description of the event and of the focused
 * element; this returns what (if anything) to do. Keeping the rules here means
 * the modifier, typing-target and shortcut guards are unit-tested without a
 * real keyboard.
 */

export type NavIntent =
  | "next"
  | "prev"
  | "first"
  | "last"
  | "toggle-toc"
  | "close-toc"
  | null;

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Shift is explicitly allowed; listed so callers pass it consistently. */
  shiftKey?: boolean;
  /** True while an IME composition is active. */
  isComposing?: boolean;
  /** True when another handler already consumed the event. */
  defaultPrevented?: boolean;
}

export interface FocusLike {
  tagName?: string;
  isContentEditable?: boolean;
  /** True when focus is inside the contents panel (its own keys). */
  inContentsPanel?: boolean;
}

const TYPING_TAGS = new Set(["input", "textarea", "select"]);

/**
 * True when the focused element should keep the keystroke. Text fields,
 * contenteditable regions, selects and the contents panel are all left alone;
 * the panel already offers native button behaviour.
 */
export function isTypingTarget(target: FocusLike | null | undefined): boolean {
  if (!target) return false;
  if (target.inContentsPanel) return true;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toLowerCase();
  return TYPING_TAGS.has(tag);
}

/**
 * Decide what a keydown means for the reader.
 *
 * Modifier keys other than Shift are never ours (so browser and OS shortcuts
 * keep working), synthetic/consumed/IME events are ignored, and keystrokes in a
 * typing target are left to the page. Escape closes the contents panel only
 * when it is open.
 */
export function navIntent(
  event: KeyLike | null | undefined,
  target: FocusLike | null | undefined,
  tocOpen: boolean,
): NavIntent {
  if (!event || event.defaultPrevented || event.isComposing) return null;
  if (event.key === "Escape") return tocOpen ? "close-toc" : null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTypingTarget(target)) return null;

  switch (event.key) {
    case "ArrowRight":
    case "PageDown":
      return "next";
    case "ArrowLeft":
    case "PageUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "c":
    case "C":
      return "toggle-toc";
    default:
      return null;
  }
}
