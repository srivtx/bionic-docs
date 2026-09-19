/**
 * Cross-browser WebExtension shim.
 *
 * Chrome exposes `chrome.*` (callback based, with promise support on most
 * APIs in MV3). Firefox exposes both `browser.*` (promise based) and a
 * `chrome.*` alias. We prefer `browser` when present so Firefox users get
 * native promises, and fall back to `chrome`.
 *
 * This module must stay dependency-free and importable from a service worker,
 * a content script, and an extension page.
 */

type AnyApi = Record<string, any>;

const g = globalThis as unknown as { browser?: AnyApi; chrome?: AnyApi };

/** The best available extension API namespace, or undefined outside an extension. */
export const api: AnyApi | undefined = g.browser ?? g.chrome;

/** True when running outside a WebExtension context (unit tests, plain pages). */
export const degraded: boolean = typeof api === "undefined";

/** True when the promise-based `browser` namespace is available (Firefox). */
export const isFirefoxStyle: boolean = typeof g.browser !== "undefined";

export function hasApi(): boolean {
  return typeof api !== "undefined";
}

/** Call an API method that may be callback-based (chrome) or promise-based (browser). */
export function call<T = unknown>(fn: (...args: any[]) => any, thisArg: unknown, ...args: any[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const done = (value: T): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const fail = (err: unknown): void => {
      if (!settled) {
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    try {
      const maybe = fn.call(thisArg, ...args, (result: T) => {
        const lastError = (api as AnyApi | undefined)?.runtime?.lastError;
        if (lastError) fail(lastError.message ?? lastError);
        else done(result);
      });
      if (maybe && typeof (maybe as Promise<T>).then === "function") {
        (maybe as Promise<T>).then(done, fail);
      }
    } catch (err) {
      fail(err);
    }
  });
}

/** True if `before` still holds, used to avoid clobbering concurrently. */
export function noop(): void {
  /* intentionally empty */
}
