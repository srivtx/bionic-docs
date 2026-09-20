/**
 * Pure reading-position memory.
 *
 * The store is a small map from a stable document identity to the last page or
 * chapter the reader was on. Identity is a content fingerprint (kind + byte
 * length + FNV-1a of the bytes) rather than the URL: the same document is then
 * recognised when it is served at a different URL, renamed, or opened from a
 * file picker where there is no URL at all. URLs also change as query strings
 * come and go, while the bytes are what the reader actually showed.
 *
 * No storage or DOM here: the reader owns the async read/write.
 */

export type DocKind = "pdf" | "epub";

export interface StoredPosition {
  kind: DocKind;
  /** Zero-based page (PDF) or chapter (EPUB). */
  index: number;
  /** Epoch milliseconds of the last update, used to evict the oldest. */
  at: number;
}

export type PositionStore = Record<string, StoredPosition>;

/** Hard cap on remembered documents so the store cannot grow without bound. */
export const MAX_REMEMBERED = 25;

/** FNV-1a, 32-bit. Fast, dependency-free and adequate for identity. */
export function hashBytes(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable key for a document: kind, byte length and content hash. */
export function positionKey(kind: DocKind, bytes: Uint8Array): string {
  const hex = hashBytes(bytes).toString(16).padStart(8, "0");
  return `${kind}:${bytes.length}:${hex}`;
}

function toIndex(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return n >= 0 ? n : null;
}

/** Validate an untrusted (storage-read) value into a capped, newest-first store. */
export function sanitizePositionStore(raw: unknown, max = MAX_REMEMBERED): PositionStore {
  if (!raw || typeof raw !== "object") return {};
  const shaped: Array<[string, StoredPosition]> = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length === 0 || !value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const kind = record.kind === "pdf" || record.kind === "epub" ? record.kind : null;
    const index = toIndex(record.index);
    if (kind === null || index === null) continue;
    shaped.push([key, { kind, index, at: toIndex(record.at) ?? 0 }]);
  }
  shaped.sort((a, b) => b[1].at - a[1].at);
  const out: PositionStore = {};
  for (const [key, position] of shaped.slice(0, Math.max(0, Math.trunc(max)))) out[key] = position;
  return out;
}

/** Return the stored position for `key`, or null when absent. */
export function recallPosition(store: PositionStore, key: string): StoredPosition | null {
  const found = store[key];
  return found ? { ...found } : null;
}

/**
 * Return a new store with `key` set to `position`. When the result would exceed
 * `max`, the entries with the oldest `at` are dropped first.
 */
export function rememberPosition(
  store: PositionStore,
  key: string,
  position: StoredPosition,
  max = MAX_REMEMBERED,
): PositionStore {
  const next: PositionStore = { ...store, [key]: { ...position } };
  const cap = Math.max(0, Math.trunc(max));
  const keys = Object.keys(next);
  if (keys.length <= cap) return next;

  const byOldest = keys
    .map((k) => [k, next[k]!] as const)
    .sort((a, b) => a[1].at - b[1].at);
  for (const [k] of byOldest.slice(0, keys.length - cap)) delete next[k];
  return next;
}
