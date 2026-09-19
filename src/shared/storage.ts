import { api, call, degraded } from "./browser";
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from "./types";

const KEY = "bionic-page:settings";

function area(): any | undefined {
  return api?.storage?.sync ?? api?.storage?.local;
}

/** Load settings, falling back to defaults outside an extension context. */
export async function loadSettings(): Promise<Settings> {
  if (degraded || !area()) return sanitizeSettings(DEFAULT_SETTINGS);
  try {
    const got = await call<Record<string, unknown>>(area().get, area(), KEY);
    const raw = (got?.[KEY] ?? {}) as Partial<Settings>;
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...raw });
  } catch {
    return sanitizeSettings(DEFAULT_SETTINGS);
  }
}

/** Persist settings. Best-effort: never throws into the caller. */
export async function saveSettings(settings: Settings): Promise<void> {
  const clean = sanitizeSettings(settings);
  if (degraded || !area()) return;
  try {
    await call(area().set, area(), { [KEY]: clean });
  } catch {
    // fall back to local storage when sync is unavailable or over quota
    try {
      await call(api!.storage.local.set, api!.storage.local, { [KEY]: clean });
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const s = api?.storage?.onChanged;
  if (!s?.addListener) return () => {};
  const listener = (changes: Record<string, any>, areaName: string): void => {
    if (areaName !== "sync" && areaName !== "local") return;
    const change = changes[KEY];
    if (!change) return;
    cb(sanitizeSettings({ ...DEFAULT_SETTINGS, ...(change.newValue ?? {}) }));
  };
  s.addListener(listener);
  return () => s.removeListener(listener);
}

/** One-shot read of an arbitrary local key (used for scratch/tab state). */
export async function getLocal(key: string): Promise<unknown> {
  if (degraded || !api?.storage?.local) return undefined;
  try {
    const got = await call<Record<string, unknown>>(api.storage.local.get, api.storage.local, key);
    return got?.[key];
  } catch {
    return undefined;
  }
}
