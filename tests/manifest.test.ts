/**
 * Tests for the generated manifests. `scripts/manifest.mjs` is the single
 * source of truth; the Chrome and Firefox targets must stay aligned on
 * identity, permissions and shared UI surfaces while differing only where the
 * engines require it.
 */

import { describe, expect, test } from "bun:test";
import { manifestFor } from "../scripts/manifest.mjs";

describe("generated manifests", () => {
  const version = "9.9.9";

  test("both targets are MV3 with the same name and version", () => {
    for (const target of ["chrome", "firefox"] as const) {
      const m = manifestFor(target, version);
      expect(m.manifest_version).toBe(3);
      expect(m.name).toBe("Bionic Docs");
      expect(m.version).toBe(version);
    }
  });

  test("permissions are exactly storage + activeTab", () => {
    for (const target of ["chrome", "firefox"] as const) {
      const m = manifestFor(target, version);
      expect(m.permissions).toEqual(["storage", "activeTab"]);
      expect(m.host_permissions).toEqual(["<all_urls>"]);
    }
  });

  test("chrome has no gecko block and uses a background service worker", () => {
    const m = manifestFor("chrome", version);
    expect(m.browser_specific_settings).toBeUndefined();
    expect(m.background.service_worker).toBe("background.js");
    expect(m.background.scripts).toBeUndefined();
  });

  test("firefox carries the gecko metadata and uses background scripts", () => {
    const m = manifestFor("firefox", version);
    expect(m.minimum_chrome_version).toBeUndefined();
    expect(Array.isArray(m.background.scripts)).toBe(true);
    expect(m.background.service_worker).toBeUndefined();
    expect(m.browser_specific_settings.gecko.id).toContain("@");
    expect(m.browser_specific_settings.gecko.data_collection_permissions.required).toEqual(["none"]);
    // data_collection_permissions is only understood from Firefox 140 onward.
    expect(
      Number.parseFloat(m.browser_specific_settings.gecko.strict_min_version),
    ).toBeGreaterThanOrEqual(140);
  });

  test("action, options, icons and the open-reader command are present", () => {
    for (const target of ["chrome", "firefox"] as const) {
      const m = manifestFor(target, version);
      expect(m.action.default_popup).toBe("popup.html");
      expect(m.options_ui.page).toBe("options.html");
      expect(Object.keys(m.icons).sort()).toEqual(["128", "16", "32", "48"]);
      expect(m.commands["open-reader"]).toBeDefined();
    }
  });

  test("unknown targets are rejected", () => {
    expect(() => manifestFor("safari" as never, version)).toThrow();
  });
});
