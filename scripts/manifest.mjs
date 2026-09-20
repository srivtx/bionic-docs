/**
 * Single source of truth for the generated manifests (Chrome + Firefox).
 */

export const NAME = "Bionic Docs";
export const DESCRIPTION =
  "Read PDF and EPUB files with bionic fixation emphasis, entirely on-device. No upload, no account, no tracking.";

export const ICONS = {
  16: "icons/icon16.png",
  32: "icons/icon32.png",
  48: "icons/icon48.png",
  128: "icons/icon128.png",
};

export function baseManifest(version) {
  return {
    manifest_version: 3,
    name: NAME,
    version,
    description: DESCRIPTION,
    permissions: ["storage", "activeTab"],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: NAME,
      default_popup: "popup.html",
      default_icon: ICONS,
    },
    options_ui: { page: "options.html", open_in_tab: true },
    icons: ICONS,
    web_accessible_resources: [
      {
        resources: ["reader.html", "pdf.worker.min.mjs", "cmaps/*", "standard_fonts/*"],
        matches: ["<all_urls>"],
      },
    ],
    commands: {
      "open-reader": {
        suggested_key: { default: "Ctrl+Shift+O", mac: "Command+Shift+O" },
        description: "Open the current document in Bionic Docs",
      },
    },
  };
}

export function manifestFor(target, version) {
  const base = baseManifest(version);
  if (target === "chrome") {
    return {
      ...base,
      minimum_chrome_version: "116",
      background: { service_worker: "background.js" },
    };
  }
  if (target === "firefox") {
    return {
      ...base,
      background: { scripts: ["background.js"] },
      browser_specific_settings: {
        gecko: {
          id: "bionic-docs@srivtx.github.io",
          strict_min_version: "140.0",
          data_collection_permissions: { required: ["none"] },
        },
        gecko_android: { strict_min_version: "142.0" },
      },
    };
  }
  throw new Error(`unknown target: ${target}`);
}
